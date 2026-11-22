import { existsSync, readFileSync } from 'node:fs';

import {
  NETWORK_FORMAT_VERSION,
  type Footpath,
  type NetworkData,
  type Route,
  type Stop,
} from '../data/network-types.ts';
import { haversine } from '../geo/geometry.ts';
import { normalizeText } from '../text.ts';

/**
 * Capa de datos de la red de transporte.
 *
 * El prototipo la implementa en memoria (`InMemoryNetworkStore`). La interfaz permite
 * reemplazarla por PostgreSQL/PostGIS en producción sin tocar la capa HTTP.
 */
export interface NetworkRepository {
  readonly info: NetworkInfo;
  searchRoutes(filter: RouteFilter): RouteSummary[];
  getRoute(id: string): Route | undefined;
  getStop(id: string): Stop | undefined;
  nearbyStops(lat: number, lng: number, radiusM: number, limit: number): NearbyStop[];
  routeSummary(route: Route): RouteSummary;
  routeBounds(route: Route): Bounds;
  allRoutes(): readonly Route[];
  allStops(): Iterable<Stop>;
  /** Conexiones a pie entre paradas cercanas (para transbordos). */
  footpaths(): readonly Footpath[];
}

export interface NetworkInfo {
  generatedAt: string;
  routes: number;
  stops: number;
  footpaths: number;
  sources: NetworkData['sources'];
}

export interface RouteFilter {
  /** Texto libre: código, nombre o empresa. */
  query?: string;
  /** Tipo de ruta (Directa Centro, Integrada, Circular, Directa No Centro). */
  type?: string;
  limit: number;
}

export interface RouteSummary {
  id: string;
  code: string;
  name: string;
  company: string;
  type: string;
  system: string;
  lengthM: number;
  stopCount: number;
  /** `false` si la ruta no tiene paradas oficiales: no entra al planificador. */
  plannable: boolean;
}

export interface Bounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface NearbyStop extends Stop {
  distanceM: number;
}

/** Tamaño de celda del índice espacial de paradas, en grados (~550 m). */
const GRID_CELL_DEG = 0.005;
const METERS_PER_DEG_LAT = 111_320;

export class InMemoryNetworkStore implements NetworkRepository {
  readonly info: NetworkInfo;
  private readonly routes: Route[];
  private readonly footpathList: Footpath[];
  private readonly routesById = new Map<string, Route>();
  private readonly stopsById = new Map<string, Stop>();
  private readonly searchText = new Map<string, { code: string; text: string }>();
  private readonly bounds = new Map<string, Bounds>();
  private readonly grid = new Map<string, Stop[]>();

  constructor(data: NetworkData) {
    if (data.version !== NETWORK_FORMAT_VERSION) {
      throw new Error(
        `network.json tiene la versión ${String(data.version)} y se esperaba ` +
          `${NETWORK_FORMAT_VERSION}. Ejecuta: npm run data:build`
      );
    }
    this.routes = data.routes;
    this.footpathList = data.footpaths;
    for (const route of data.routes) {
      this.routesById.set(route.id, route);
      this.searchText.set(route.id, {
        code: normalizeText(route.code),
        text: normalizeText(`${route.code} ${route.name} ${route.company}`),
      });
      this.bounds.set(route.id, computeBounds(route));
    }
    for (const stop of data.stops) {
      this.stopsById.set(stop.id, stop);
      const key = cellKey(cellOf(stop.lat), cellOf(stop.lng));
      const cell = this.grid.get(key) ?? [];
      cell.push(stop);
      this.grid.set(key, cell);
    }
    this.info = {
      generatedAt: data.generatedAt,
      routes: data.routes.length,
      stops: data.stops.length,
      footpaths: data.footpaths.length,
      sources: data.sources,
    };
  }

  static fromFile(file: string): InMemoryNetworkStore {
    if (!existsSync(file)) {
      throw new Error(
        `No se encontró ${file}. Genera la red primero con: cd server && npm run data:build`
      );
    }
    return new InMemoryNetworkStore(JSON.parse(readFileSync(file, 'utf8')) as NetworkData);
  }

  searchRoutes({ query, type, limit }: RouteFilter): RouteSummary[] {
    const normalizedType = type ? normalizeText(type) : undefined;
    const q = query ? normalizeText(query) : '';
    const tokens = q.split(' ').filter(Boolean);

    const ranked: { route: Route; score: number }[] = [];
    for (const route of this.routes) {
      if (normalizedType && normalizeText(route.type) !== normalizedType) continue;
      const { code, text } = this.searchText.get(route.id)!;
      if (!tokens.every((token) => text.includes(token))) continue;
      let score = 4;
      if (q && code === q) score = 0;
      else if (q && code.startsWith(q)) score = 1;
      else if (q && text.split(' ').some((word) => word.startsWith(tokens[0]!))) score = 2;
      else if (q) score = 3;
      ranked.push({ route, score });
    }
    ranked.sort(
      (a, b) =>
        a.score - b.score || a.route.code.localeCompare(b.route.code, 'es', { numeric: true })
    );
    return ranked.slice(0, limit).map(({ route }) => this.routeSummary(route));
  }

  allRoutes(): readonly Route[] {
    return this.routes;
  }

  allStops(): Iterable<Stop> {
    return this.stopsById.values();
  }

  footpaths(): readonly Footpath[] {
    return this.footpathList;
  }

  getRoute(id: string): Route | undefined {
    return this.routesById.get(id);
  }

  getStop(id: string): Stop | undefined {
    return this.stopsById.get(id);
  }

  nearbyStops(lat: number, lng: number, radiusM: number, limit: number): NearbyStop[] {
    const dLat = radiusM / METERS_PER_DEG_LAT;
    const dLng = radiusM / (METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180));
    const result: NearbyStop[] = [];
    for (let i = cellOf(lat - dLat); i <= cellOf(lat + dLat); i++) {
      for (let j = cellOf(lng - dLng); j <= cellOf(lng + dLng); j++) {
        for (const stop of this.grid.get(cellKey(i, j)) ?? []) {
          const distanceM = haversine(lat, lng, stop.lat, stop.lng);
          if (distanceM <= radiusM) result.push({ ...stop, distanceM: Math.round(distanceM) });
        }
      }
    }
    return result.sort((a, b) => a.distanceM - b.distanceM).slice(0, limit);
  }

  routeSummary(route: Route): RouteSummary {
    return {
      id: route.id,
      code: route.code,
      name: route.name,
      company: route.company,
      type: route.type,
      system: route.system,
      lengthM: route.lengthM,
      stopCount: route.stops.length,
      plannable: route.stops.length > 0,
    };
  }

  routeBounds(route: Route): Bounds {
    return this.bounds.get(route.id) ?? computeBounds(route);
  }
}

function cellOf(degrees: number): number {
  return Math.floor(degrees / GRID_CELL_DEG);
}

function cellKey(latCell: number, lngCell: number): string {
  return `${latCell}:${lngCell}`;
}

function computeBounds(route: Route): Bounds {
  const bounds: Bounds = { north: -90, south: 90, east: -180, west: 180 };
  for (const [lat, lng] of route.path) {
    bounds.north = Math.max(bounds.north, lat);
    bounds.south = Math.min(bounds.south, lat);
    bounds.east = Math.max(bounds.east, lng);
    bounds.west = Math.min(bounds.west, lng);
  }
  return bounds;
}
