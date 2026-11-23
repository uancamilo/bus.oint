/**
 * Simulación de buses sobre los circuitos de cada ruta.
 *
 * Modelo: cada ruta es un circuito cerrado (ida + vuelta) por el que dan vueltas N buses
 * separados a la misma distancia (`spacingM`) y a velocidad constante. La posición de cada
 * bus es una función pura de la hora:
 *
 *   posición(t) = (desfase + i · separación + velocidad · t) mod longitud
 *
 * No hay estado que avanzar ni que se pueda desincronizar: dos consultas en el mismo
 * instante dan la misma respuesta, y al reiniciar el servidor los buses siguen donde iban.
 * Las esperas en las paradas salen de estas posiciones, no de frecuencias supuestas.
 */
import type { CircuitSegment, Direction, Route, RouteStop } from '../data/network-types.ts';
import { haversine } from '../geo/geometry.ts';
import type { NetworkRepository } from '../network/network-store.ts';

export interface SimulationConfig {
  /** Distancia entre buses consecutivos de una ruta (metros). */
  spacingM: number;
  /** Velocidad comercial de los buses (km/h). */
  speedKmh: number;
}

export type Clock = () => number;

export interface BusState {
  /** `${routeId}-${n}`, estable entre consultas. */
  id: string;
  routeId: string;
  lat: number;
  lng: number;
  /** Rumbo en grados: 0 = norte, 90 = oriente. */
  heading: number;
  /** Sentido actual; `null` mientras cruza un hueco entre sentidos. */
  direction: Direction | null;
  /** `false` en tramos a terminal: la app no debe dibujarlo. */
  visible: boolean;
  /** Posición sobre el circuito (metros). */
  atM: number;
  nextStop: { id: string; seq: number; distanceM: number; etaS: number } | null;
}

export interface Arrival {
  busId: string;
  etaS: number;
  distanceM: number;
}

export interface StopArrivals {
  routeId: string;
  direction: Direction;
  seq: number;
  /** Próximos buses, del más cercano al más lejano. */
  arrivals: Arrival[];
}

interface Track {
  route: Route;
  lengthM: number;
  /** Distancia acumulada de cada vértice de `route.path`, en la misma escala que `atM`. */
  cumulative: number[];
  busCount: number;
  spacingM: number;
  offsetM: number;
  /** Paradas ordenadas por posición (las de `route.stops` ya lo están). */
  stops: RouteStop[];
  segments: CircuitSegment[];
}

export class BusSimulator {
  readonly speedMps: number;
  readonly totalBuses: number;
  private readonly tracks = new Map<string, Track>();
  /** Para cada parada física: en qué rutas y en qué posición del circuito aparece. */
  private readonly stopIndex = new Map<string, { track: Track; stop: RouteStop }[]>();

  constructor(
    network: NetworkRepository,
    readonly config: SimulationConfig,
    private readonly clock: Clock = Date.now
  ) {
    if (!(config.spacingM > 0) || !(config.speedKmh > 0)) {
      throw new Error('La separación y la velocidad de los buses deben ser mayores que cero');
    }
    this.speedMps = config.speedKmh / 3.6;
    let total = 0;
    for (const route of network.allRoutes()) {
      const track = buildTrack(route, config.spacingM);
      this.tracks.set(route.id, track);
      total += track.busCount;
      for (const stop of track.stops) {
        const list = this.stopIndex.get(stop.stopId) ?? [];
        list.push({ track, stop });
        this.stopIndex.set(stop.stopId, list);
      }
    }
    this.totalBuses = total;
  }

  /** Instante actual del reloj de la simulación (ms). */
  now(): number {
    return this.clock();
  }

  hasRoute(routeId: string): boolean {
    return this.tracks.has(routeId);
  }

  /** Estado de todos los buses de una ruta en el instante `nowMs`. */
  busesOnRoute(routeId: string, nowMs = this.clock()): BusState[] {
    const track = this.tracks.get(routeId);
    if (!track) return [];
    const buses: BusState[] = [];
    for (let i = 0; i < track.busCount; i++) {
      buses.push(this.busState(track, i, nowMs));
    }
    return buses;
  }

  /** Próximos buses que llegarán a la posición `atM` del circuito de una ruta. */
  arrivalsAt(routeId: string, atM: number, count: number, nowMs = this.clock()): Arrival[] {
    const track = this.tracks.get(routeId);
    if (!track) return [];
    const arrivals: Arrival[] = [];
    for (let i = 0; i < track.busCount; i++) {
      const distanceM = mod(atM - this.busPosition(track, i, nowMs), track.lengthM);
      arrivals.push({
        busId: busId(track, i),
        distanceM: Math.round(distanceM),
        etaS: Math.round(distanceM / this.speedMps),
      });
    }
    return arrivals.sort((a, b) => a.distanceM - b.distanceM).slice(0, count);
  }

  /**
   * Primer bus que pasa por la posición `atM` a partir del instante `fromMs` (sin redondeo).
   * Lo usa el planificador para encadenar esperas y trayectos con precisión.
   */
  nextBus(routeId: string, atM: number, fromMs: number): { busId: string; atMs: number } | null {
    const track = this.tracks.get(routeId);
    if (!track) return null;
    let best = Number.POSITIVE_INFINITY;
    let bestIndex = 0;
    for (let i = 0; i < track.busCount; i++) {
      const distanceM = mod(atM - this.busPosition(track, i, fromMs), track.lengthM);
      if (distanceM < best) {
        best = distanceM;
        bestIndex = i;
      }
    }
    return { busId: busId(track, bestIndex), atMs: fromMs + (best / this.speedMps) * 1000 };
  }

  /** Tramo del trazado de una ruta entre dos posiciones del circuito (`fromM` < `toM`). */
  pathBetween(routeId: string, fromM: number, toM: number): [number, number][] {
    const track = this.tracks.get(routeId);
    if (!track) return [];
    const start = pointAt(track, fromM);
    const end = pointAt(track, toM);
    const inner = track.route.path.filter(
      (_, i) => track.cumulative[i]! > fromM && track.cumulative[i]! < toM
    );
    return [
      [round(start.lat, 6), round(start.lng, 6)],
      ...inner,
      [round(end.lat, 6), round(end.lng, 6)],
    ];
  }

  /** Próximas llegadas a una parada física, por ruta y sentido. */
  stopArrivals(stopId: string, count: number, nowMs = this.clock()): StopArrivals[] {
    const entries = this.stopIndex.get(stopId) ?? [];
    return entries
      .map(({ track, stop }) => ({
        routeId: track.route.id,
        direction: stop.direction,
        seq: stop.seq,
        arrivals: this.arrivalsAt(track.route.id, stop.atM, count, nowMs),
      }))
      .sort((a, b) => (a.arrivals[0]?.etaS ?? Infinity) - (b.arrivals[0]?.etaS ?? Infinity));
  }

  private busPosition(track: Track, index: number, nowMs: number): number {
    const travelled = this.speedMps * (nowMs / 1000);
    return mod(track.offsetM + index * track.spacingM + travelled, track.lengthM);
  }

  private busState(track: Track, index: number, nowMs: number): BusState {
    const atM = this.busPosition(track, index, nowMs);
    const { lat, lng, heading } = pointAt(track, atM);
    const segment = track.segments.find((s) => atM >= s.startM && atM < s.endM);
    const next = nextStopAfter(track, atM);
    return {
      id: busId(track, index),
      routeId: track.route.id,
      lat: round(lat, 6),
      lng: round(lng, 6),
      heading: Math.round(heading),
      direction: segment?.kind === 'service' ? segment.direction : null,
      visible: segment?.kind !== 'deadhead',
      atM: Math.round(atM),
      nextStop: next
        ? {
            id: next.stop.stopId,
            seq: next.stop.seq,
            distanceM: Math.round(next.distanceM),
            etaS: Math.round(next.distanceM / this.speedMps),
          }
        : null,
    };
  }
}

function buildTrack(route: Route, spacingM: number): Track {
  // Distancias geodésicas entre vértices, reescaladas para coincidir con `lengthM` y `atM`
  // (calculadas en EPSG:9377, cuya escala difiere ~0,02 % en Medellín).
  const raw: number[] = [0];
  for (let i = 1; i < route.path.length; i++) {
    const [lat1, lng1] = route.path[i - 1]!;
    const [lat2, lng2] = route.path[i]!;
    raw.push(raw[i - 1]! + haversine(lat1, lng1, lat2, lng2));
  }
  const scale = route.lengthM / (raw.at(-1) || 1);
  const busCount = Math.max(1, Math.round(route.lengthM / spacingM));
  return {
    route,
    lengthM: route.lengthM,
    cumulative: raw.map((d) => d * scale),
    busCount,
    spacingM: route.lengthM / busCount,
    // Desfase estable por ruta para que no todas arranquen en el mismo punto.
    offsetM: ((hash(route.id) % 10_000) / 10_000) * (route.lengthM / busCount),
    stops: route.stops,
    segments: route.segments,
  };
}

function pointAt(track: Track, atM: number): { lat: number; lng: number; heading: number } {
  const { cumulative } = track;
  const path = track.route.path;
  // Búsqueda binaria del tramo [i, i+1] que contiene atM.
  let lo = 0;
  let hi = cumulative.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cumulative[mid]! <= atM) lo = mid;
    else hi = mid;
  }
  const [lat1, lng1] = path[lo]!;
  const [lat2, lng2] = path[hi]!;
  const span = cumulative[hi]! - cumulative[lo]!;
  const t = span > 0 ? (atM - cumulative[lo]!) / span : 0;
  return {
    lat: lat1 + (lat2 - lat1) * t,
    lng: lng1 + (lng2 - lng1) * t,
    heading: bearing(lat1, lng1, lat2, lng2),
  };
}

function nextStopAfter(track: Track, atM: number): { stop: RouteStop; distanceM: number } | null {
  const { stops, lengthM } = track;
  if (stops.length === 0) return null;
  // Primera parada estrictamente delante; si no hay, la primera de la siguiente vuelta.
  let lo = 0;
  let hi = stops.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (stops[mid]!.atM <= atM) lo = mid + 1;
    else hi = mid;
  }
  const stop = stops[lo] ?? stops[0]!;
  return { stop, distanceM: mod(stop.atM - atM, lengthM) };
}

function bearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = Math.PI / 180;
  const y = Math.sin((lng2 - lng1) * toRad) * Math.cos(lat2 * toRad);
  const x =
    Math.cos(lat1 * toRad) * Math.sin(lat2 * toRad) -
    Math.sin(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.cos((lng2 - lng1) * toRad);
  return mod((Math.atan2(y, x) * 180) / Math.PI, 360);
}

function busId(track: Track, index: number): string {
  return `${track.route.id}-${index + 1}`;
}

function mod(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Hash entero estable (FNV-1a) para derivar desfases deterministas. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
