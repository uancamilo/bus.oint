/**
 * Procesa los GeoJSON oficiales de Medellín y genera `data/processed/network.json`.
 *
 *   npm run data:build
 *
 * Pasos:
 *  1. Lee rutas (LineString/MultiLineString) y paradas (Point), ambas en EPSG:9377.
 *  2. Une los trazados de varias partes y los orienta según el orden oficial de paradas
 *     (muchos trazados vienen dibujados en sentido contrario al recorrido).
 *  3. Descarta trazados con tramos repetidos (errores de digitalización).
 *  4. Simplifica los trazados y arma un circuito cerrado por ruta: ida + vuelta + huecos.
 *  5. Ubica cada parada sobre el circuito y agrupa paradas físicas (`id_paradero`).
 *  6. Calcula conexiones a pie entre paradas cercanas (para transbordos).
 *  7. Convierte todo a latitud/longitud y valida la conversión contra las coordenadas
 *     WGS84 que traen las propias paradas.
 */
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  NETWORK_FORMAT_VERSION,
  type CircuitSegment,
  type Direction,
  type Footpath,
  type LatLngTuple,
  type NetworkData,
  type Route,
  type RouteStop,
  type Stop,
} from '../src/data/network-types.ts';
import {
  cumulativeLengths,
  distance,
  haversine,
  polylineLength,
  projectOnPolyline,
  simplify,
  type Xy,
} from '../src/geo/geometry.ts';
import { toLatLng } from '../src/geo/projection.ts';

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------

const DATA_DIR = path.resolve(import.meta.dirname, '../../data');
const ROUTES_FILE = 'rutas_de_transporte_publi.geojson';
const STOPS_FILE = 'paradas_de_transporte_pub.geojson';
const OUTPUT_DIR = path.join(DATA_DIR, 'processed');

/** Tolerancia de simplificación de trazados (metros). */
const SIMPLIFY_TOLERANCE_M = 3;
/** Hueco máximo entre sentidos que el bus recorre visible, en línea recta (metros). */
const MAX_CONNECTOR_M = 300;
/** Distancia máxima en línea recta para una conexión a pie entre paradas (metros). */
const FOOTPATH_RADIUS_M = 250;
/** Proporción mínima de puntos únicos; por debajo el trazado se considera corrupto. */
const MIN_UNIQUE_POINT_RATIO = 0.6;
/** Holgura al ubicar paradas en orden sobre el trazado (metros). */
const MONOTONIC_SLACK_M = 30;

// ---------------------------------------------------------------------------
// Datos de entrada
// ---------------------------------------------------------------------------

type RawDirection = 'Origen-Destino' | 'Destino-Origen';

interface RawRouteProps {
  id_ruta: string;
  codigo: string;
  nombre: string;
  recorrido: RawDirection;
  sistema: string;
  tipo: string;
  empresa: string;
  fecha_actualizacion: number;
}

interface RawStopProps {
  id_paradero: number;
  id_ruta: number;
  nro_parada: number;
  direccion: string | null;
  recorrido: RawDirection;
  latitud: number;
  longitud: number;
  fecha_actualizacion: number;
}

type RawGeometry =
  | { type: 'LineString'; coordinates: number[][] }
  | { type: 'MultiLineString'; coordinates: number[][][] }
  | { type: 'Point'; coordinates: number[] };

interface RawFeature<P> {
  properties: P;
  geometry: RawGeometry | null;
}

interface RawCollection<P> {
  crs?: { properties?: { name?: string } };
  features: RawFeature<P>[];
}

function readCollection<P>(file: string): RawCollection<P> {
  const collection = JSON.parse(
    readFileSync(path.join(DATA_DIR, file), 'utf8')
  ) as RawCollection<P>;
  const crs = collection.crs?.properties?.name;
  if (crs !== 'EPSG:9377') {
    throw new Error(`${file}: se esperaba EPSG:9377 y llegó ${crs ?? 'sin CRS'}`);
  }
  return collection;
}

const DIRECTION: Record<RawDirection, Direction> = {
  'Origen-Destino': 'ida',
  'Destino-Origen': 'vuelta',
};

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const round = (value: number, decimals: number) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const isoDate = (epochMs: number) => new Date(epochMs).toISOString().slice(0, 10);

function quantile(values: number[], q: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
}

function toXy(coordinate: number[]): Xy {
  return [coordinate[0]!, coordinate[1]!];
}

/** Une las partes de un MultiLineString encadenando los extremos más cercanos. */
function chainParts(parts: Xy[][]): Xy[] {
  let line = parts[0] ?? [];
  for (const part of parts.slice(1)) {
    const options: [number, Xy[]][] = [
      [distance(line.at(-1)!, part[0]!), [...line, ...part]],
      [distance(line.at(-1)!, part.at(-1)!), [...line, ...part.toReversed()]],
      [distance(line[0]!, part.at(-1)!), [...part, ...line]],
      [distance(line[0]!, part[0]!), [...part.toReversed(), ...line]],
    ];
    line = options.reduce((best, option) => (option[0] < best[0] ? option : best))[1];
  }
  return line;
}

function uniquePointRatio(points: readonly Xy[]): number {
  const keys = new Set(points.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`));
  return keys.size / points.length;
}

/**
 * ¿El trazado avanza en el mismo orden que las paradas? Compara cuántos pares de paradas
 * consecutivas avanzan o retroceden sobre la línea. Funciona también en rutas circulares,
 * donde la primera y la última parada están en el mismo lugar.
 */
function followsStopOrder(line: readonly Xy[], orderedStops: readonly Xy[]): boolean {
  const cumulative = cumulativeLengths(line);
  const along = orderedStops.map((p) => projectOnPolyline(p, line, cumulative)?.along ?? 0);
  let forward = 0;
  let backward = 0;
  for (let i = 1; i < along.length; i++) {
    if (along[i]! > along[i - 1]!) forward++;
    else if (along[i]! < along[i - 1]!) backward++;
  }
  return forward >= backward;
}

// ---------------------------------------------------------------------------
// Proceso
// ---------------------------------------------------------------------------

interface StopRecord {
  stopId: string;
  routeId: string;
  direction: Direction;
  seq: number;
  xy: Xy;
}

interface RouteIssue {
  routeId: string;
  code: string;
  name: string;
  issue: string;
}

function main() {
  const startedAt = Date.now();
  const rawRoutes = readCollection<RawRouteProps>(ROUTES_FILE);
  const rawStops = readCollection<RawStopProps>(STOPS_FILE);

  // --- Paradas: registros por ruta y paradas físicas ----------------------
  const stopRecords = new Map<string, StopRecord[]>(); // clave: `${routeId}|${direction}`
  const physicalStops = new Map<
    string,
    { xy: Xy; lat: number; lng: number; addresses: Map<string, number>; routeIds: Set<string> }
  >();
  const projectionErrors: number[] = [];
  const seenRecords = new Set<string>();
  let duplicateStopRecords = 0;
  let stopDateMin = Number.POSITIVE_INFINITY;
  let stopDateMax = Number.NEGATIVE_INFINITY;

  for (const feature of rawStops.features) {
    if (feature.geometry?.type !== 'Point') continue;
    const p = feature.properties;
    const xy = toXy(feature.geometry.coordinates);
    const stopId = String(p.id_paradero);
    const routeId = String(p.id_ruta);
    const direction = DIRECTION[p.recorrido];
    stopDateMin = Math.min(stopDateMin, p.fecha_actualizacion);
    stopDateMax = Math.max(stopDateMax, p.fecha_actualizacion);

    const recordKey = `${routeId}|${direction}|${p.nro_parada}|${stopId}`;
    if (seenRecords.has(recordKey)) {
      duplicateStopRecords++;
      continue;
    }
    seenRecords.add(recordKey);

    const key = `${routeId}|${direction}`;
    const list = stopRecords.get(key) ?? [];
    list.push({ stopId, routeId, direction, seq: p.nro_parada, xy });
    stopRecords.set(key, list);

    let physical = physicalStops.get(stopId);
    if (!physical) {
      // Validación de la proyección: comparamos nuestra conversión con el WGS84 oficial.
      const converted = toLatLng(xy);
      projectionErrors.push(haversine(converted.lat, converted.lng, p.latitud, p.longitud));
      physical = {
        xy,
        lat: p.latitud,
        lng: p.longitud,
        addresses: new Map(),
        routeIds: new Set(),
      };
      physicalStops.set(stopId, physical);
    }
    physical.routeIds.add(routeId);
    if (p.direccion) {
      physical.addresses.set(p.direccion, (physical.addresses.get(p.direccion) ?? 0) + 1);
    }
  }
  for (const list of stopRecords.values()) list.sort((a, b) => a.seq - b.seq);

  // --- Rutas: agrupar los dos sentidos -------------------------------------
  const routeGroups = new Map<
    string,
    { meta: RawRouteProps; lines: Partial<Record<Direction, Xy[]>> }
  >();
  let rawPointCount = 0;
  for (const feature of rawRoutes.features) {
    const g = feature.geometry;
    if (!g || g.type === 'Point') continue;
    const parts =
      g.type === 'LineString' ? [g.coordinates.map(toXy)] : g.coordinates.map((c) => c.map(toXy));
    const line = chainParts(parts);
    rawPointCount += line.length;
    const meta = feature.properties;
    const group = routeGroups.get(meta.id_ruta) ?? { meta, lines: {} };
    group.lines[DIRECTION[meta.recorrido]] = line;
    routeGroups.set(meta.id_ruta, group);
  }

  const routes: Route[] = [];
  const excluded: RouteIssue[] = [];
  const warnings: RouteIssue[] = [];
  const gaps: number[] = [];
  const stopOffsets: number[] = [];
  let reversedLines = 0;
  let outOfOrderStops = 0;
  let simplifiedPointCount = 0;

  for (const [routeId, { meta, lines }] of routeGroups) {
    const issue = (text: string): RouteIssue => ({
      routeId,
      code: meta.codigo,
      name: meta.nombre,
      issue: text,
    });

    const ida = lines.ida;
    const vuelta = lines.vuelta;
    if (!ida || !vuelta) {
      excluded.push(issue('le falta uno de los dos sentidos'));
      continue;
    }

    const corrupt = (['ida', 'vuelta'] as const).find(
      (d) => uniquePointRatio(lines[d]!) < MIN_UNIQUE_POINT_RATIO
    );
    if (corrupt) {
      const ratio = uniquePointRatio(lines[corrupt]!);
      const km = polylineLength(lines[corrupt]!) / 1000;
      excluded.push(
        issue(
          `trazado de ${corrupt} con tramos repetidos (${Math.round(ratio * 100)} % de puntos únicos, ` +
            `${km.toFixed(0)} km)`
        )
      );
      continue;
    }

    // Orientación según el orden oficial de paradas.
    const oriented: Record<Direction, Xy[]> = { ida, vuelta };
    const hasStops: Record<Direction, boolean> = { ida: false, vuelta: false };
    for (const direction of ['ida', 'vuelta'] as const) {
      const records = stopRecords.get(`${routeId}|${direction}`);
      if (records && records.length >= 2) {
        hasStops[direction] = true;
        if (
          !followsStopOrder(
            oriented[direction],
            records.map((r) => r.xy)
          )
        ) {
          oriented[direction] = oriented[direction].toReversed();
          reversedLines++;
        }
      }
    }
    // Un sentido sin paradas se orienta para que empalme con el otro.
    if (hasStops.ida !== hasStops.vuelta) {
      const fixed: Direction = hasStops.ida ? 'ida' : 'vuelta';
      const free: Direction = fixed === 'ida' ? 'vuelta' : 'ida';
      const anchor = fixed === 'ida' ? oriented.ida.at(-1)! : oriented.vuelta[0]!;
      const line = oriented[free];
      const keep = fixed === 'ida' ? distance(anchor, line[0]!) : distance(anchor, line.at(-1)!);
      const flip = fixed === 'ida' ? distance(anchor, line.at(-1)!) : distance(anchor, line[0]!);
      if (flip < keep) oriented[free] = line.toReversed();
    } else if (!hasStops.ida) {
      const keep = distance(oriented.ida.at(-1)!, oriented.vuelta[0]!);
      const flip = distance(oriented.ida.at(-1)!, oriented.vuelta.at(-1)!);
      if (flip < keep) oriented.vuelta = oriented.vuelta.toReversed();
      warnings.push(issue('sin paradas: se muestra y simula, pero no entra al planificador'));
    }

    // Circuito cerrado: ida → hueco → vuelta → hueco → inicio.
    const idaPts = simplify(oriented.ida, SIMPLIFY_TOLERANCE_M);
    const vueltaPts = simplify(oriented.vuelta, SIMPLIFY_TOLERANCE_M);
    const points: Xy[] = [...idaPts, ...vueltaPts, idaPts[0]!];
    const cumulative = cumulativeLengths(points);
    simplifiedPointCount += points.length;

    const idaEnd = idaPts.length - 1;
    const vueltaStart = idaPts.length;
    const vueltaEnd = points.length - 2;
    const gapKind = (meters: number) => (meters <= MAX_CONNECTOR_M ? 'connector' : 'deadhead');
    const gapA = cumulative[vueltaStart]! - cumulative[idaEnd]!;
    const gapB = cumulative[vueltaEnd + 1]! - cumulative[vueltaEnd]!;
    gaps.push(gapA, gapB);
    if (Math.max(gapA, gapB) > 1000) {
      warnings.push(
        issue(
          `hueco grande entre sentidos (${Math.round(Math.max(gapA, gapB))} m): el bus va a terminal`
        )
      );
    }

    const segments: CircuitSegment[] = [
      { kind: 'service', direction: 'ida', startM: 0, endM: cumulative[idaEnd]! },
      { kind: gapKind(gapA), startM: cumulative[idaEnd]!, endM: cumulative[vueltaStart]! },
      {
        kind: 'service',
        direction: 'vuelta',
        startM: cumulative[vueltaStart]!,
        endM: cumulative[vueltaEnd]!,
      },
      { kind: gapKind(gapB), startM: cumulative[vueltaEnd]!, endM: cumulative.at(-1)! },
    ];

    // Paradas sobre el circuito, respetando el orden oficial.
    const routeStops: RouteStop[] = [];
    const ranges: Record<Direction, [number, number]> = {
      ida: [0, idaEnd],
      vuelta: [vueltaStart, vueltaEnd],
    };
    for (const direction of ['ida', 'vuelta'] as const) {
      const records = stopRecords.get(`${routeId}|${direction}`) ?? [];
      const [from, to] = ranges[direction];
      let minAlong = Number.NEGATIVE_INFINITY;
      for (const record of records) {
        const nearest = projectOnPolyline(record.xy, points, cumulative, from, to);
        if (!nearest) continue;
        const inOrder = projectOnPolyline(record.xy, points, cumulative, from, to, minAlong);
        let chosen = nearest;
        if (inOrder && inOrder.offset <= nearest.offset + MONOTONIC_SLACK_M) chosen = inOrder;
        else outOfOrderStops++;
        minAlong = chosen.along - MONOTONIC_SLACK_M;
        stopOffsets.push(chosen.offset);
        routeStops.push({
          stopId: record.stopId,
          direction,
          seq: record.seq,
          atM: round(chosen.along, 1),
          offsetM: round(chosen.offset, 1),
        });
      }
    }
    routeStops.sort((a, b) => a.atM - b.atM);

    routes.push({
      id: routeId,
      code: meta.codigo,
      name: meta.nombre,
      company: meta.empresa,
      type: meta.tipo,
      system: meta.sistema,
      lengthM: Math.round(cumulative.at(-1)!),
      path: points.map((p): LatLngTuple => {
        const { lat, lng } = toLatLng(p);
        return [round(lat, 6), round(lng, 6)];
      }),
      segments: segments.map((s) => ({ ...s, startM: round(s.startM, 1), endM: round(s.endM, 1) })),
      stops: routeStops,
    });
  }
  routes.sort((a, b) => a.code.localeCompare(b.code, 'es', { numeric: true }));

  // Las paradas de rutas excluidas no deben anunciar esas rutas.
  const includedRouteIds = new Set(routes.map((r) => r.id));
  const stops: Stop[] = [...physicalStops.entries()]
    .map(([id, s]) => {
      const routeIds = [...s.routeIds].filter((r) => includedRouteIds.has(r)).sort();
      const address =
        [...s.addresses.entries()].sort(
          (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
        )[0]?.[0] ?? null;
      return { id, address, lat: s.lat, lng: s.lng, routeIds };
    })
    .filter((s) => s.routeIds.length > 0)
    .sort((a, b) => Number(a.id) - Number(b.id));

  // --- Conexiones a pie (rejilla espacial) ---------------------------------
  const footpaths: Footpath[] = [];
  const grid = new Map<string, { id: string; xy: Xy }[]>();
  const cellOf = (xy: Xy) => [
    Math.floor(xy[0] / FOOTPATH_RADIUS_M),
    Math.floor(xy[1] / FOOTPATH_RADIUS_M),
  ];
  for (const stop of stops) {
    const xy = physicalStops.get(stop.id)!.xy;
    const [cx, cy] = cellOf(xy);
    const key = `${cx},${cy}`;
    const cell = grid.get(key) ?? [];
    cell.push({ id: stop.id, xy });
    grid.set(key, cell);
  }
  for (const stop of stops) {
    const xy = physicalStops.get(stop.id)!.xy;
    const [cx, cy] = cellOf(xy);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const other of grid.get(`${cx! + dx},${cy! + dy}`) ?? []) {
          if (Number(other.id) <= Number(stop.id)) continue;
          const meters = distance(xy, other.xy);
          if (meters <= FOOTPATH_RADIUS_M) footpaths.push([stop.id, other.id, Math.round(meters)]);
        }
      }
    }
  }

  // --- Salida --------------------------------------------------------------
  const routeDates = rawRoutes.features.map((f) => f.properties.fecha_actualizacion);
  const network: NetworkData = {
    version: NETWORK_FORMAT_VERSION,
    generatedAt: new Date().toISOString(),
    sources: {
      routes: { file: ROUTES_FILE, updatedAt: isoDate(Math.max(...routeDates)) },
      stops: {
        file: STOPS_FILE,
        updatedFrom: isoDate(stopDateMin),
        updatedTo: isoDate(stopDateMax),
      },
    },
    routes,
    stops,
    footpaths,
  };

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const networkPath = path.join(OUTPUT_DIR, 'network.json');
  writeFileSync(networkPath, JSON.stringify(network));

  const transferStops = stops.filter((s) => s.routeIds.length >= 2).length;
  const report = {
    generatedAt: network.generatedAt,
    durationMs: Date.now() - startedAt,
    projection: {
      comparedStops: projectionErrors.length,
      errorP50M: round(quantile(projectionErrors, 0.5), 3),
      errorP95M: round(quantile(projectionErrors, 0.95), 3),
      errorMaxM: round(Math.max(...projectionErrors), 3),
    },
    routes: {
      inSource: routeGroups.size,
      included: routes.length,
      excluded: excluded.length,
      withoutStops: routes.filter((r) => r.stops.length === 0).length,
      reversedLines,
      circuitKm: {
        p50: round(
          quantile(
            routes.map((r) => r.lengthM),
            0.5
          ) / 1000,
          1
        ),
        max: round(Math.max(...routes.map((r) => r.lengthM)) / 1000, 1),
        total: Math.round(routes.reduce((sum, r) => sum + r.lengthM, 0) / 1000),
      },
      gapsBetweenDirectionsM: {
        p50: Math.round(quantile(gaps, 0.5)),
        p90: Math.round(quantile(gaps, 0.9)),
        connectors: routes.flatMap((r) => r.segments).filter((s) => s.kind === 'connector').length,
        deadheads: routes.flatMap((r) => r.segments).filter((s) => s.kind === 'deadhead').length,
      },
      points: { source: rawPointCount, simplified: simplifiedPointCount },
    },
    stops: {
      sourceRecords: rawStops.features.length,
      duplicateRecords: duplicateStopRecords,
      physical: stops.length,
      withoutAddress: stops.filter((s) => s.address === null).length,
      transferStops,
      routeStops: routes.reduce((sum, r) => sum + r.stops.length, 0),
      outOfOrder: outOfOrderStops,
      offsetToPathM: {
        p50: round(quantile(stopOffsets, 0.5), 1),
        p95: round(quantile(stopOffsets, 0.95), 1),
        max: round(Math.max(...stopOffsets), 1),
      },
    },
    footpaths: { radiusM: FOOTPATH_RADIUS_M, count: footpaths.length },
    output: {
      file: path.relative(DATA_DIR, networkPath),
      sizeMB: round(statSync(networkPath).size / 1e6, 2),
    },
    excludedRoutes: excluded,
    warnings,
  };
  writeFileSync(path.join(OUTPUT_DIR, 'build-report.json'), JSON.stringify(report, null, 2));

  printReport(report);
}

function printReport(r: {
  durationMs: number;
  projection: { comparedStops: number; errorP50M: number; errorP95M: number; errorMaxM: number };
  routes: {
    inSource: number;
    included: number;
    excluded: number;
    withoutStops: number;
    reversedLines: number;
    circuitKm: { p50: number; max: number; total: number };
    gapsBetweenDirectionsM: { p50: number; p90: number; connectors: number; deadheads: number };
    points: { source: number; simplified: number };
  };
  stops: {
    physical: number;
    withoutAddress: number;
    transferStops: number;
    routeStops: number;
    duplicateRecords: number;
    outOfOrder: number;
    offsetToPathM: { p50: number; p95: number; max: number };
  };
  footpaths: { radiusM: number; count: number };
  output: { file: string; sizeMB: number };
  excludedRoutes: RouteIssue[];
  warnings: RouteIssue[];
}) {
  const lines = [
    `Red generada en ${r.durationMs} ms → data/${r.output.file} (${r.output.sizeMB} MB)`,
    '',
    `Proyección EPSG:9377 → WGS84 (vs. coordenadas oficiales de ${r.projection.comparedStops} paradas):`,
    `  error p50 ${r.projection.errorP50M} m · p95 ${r.projection.errorP95M} m · máx ${r.projection.errorMaxM} m`,
    '',
    `Rutas: ${r.routes.included} incluidas de ${r.routes.inSource} (${r.routes.excluded} excluidas, ` +
      `${r.routes.withoutStops} sin paradas)`,
    `  trazados invertidos y corregidos: ${r.routes.reversedLines}`,
    `  circuito: mediana ${r.routes.circuitKm.p50} km · máx ${r.routes.circuitKm.max} km · ` +
      `total ${r.routes.circuitKm.total} km`,
    `  huecos entre sentidos: mediana ${r.routes.gapsBetweenDirectionsM.p50} m · p90 ` +
      `${r.routes.gapsBetweenDirectionsM.p90} m (${r.routes.gapsBetweenDirectionsM.connectors} conectores, ` +
      `${r.routes.gapsBetweenDirectionsM.deadheads} a terminal)`,
    `  puntos: ${r.routes.points.source} → ${r.routes.points.simplified} tras simplificar`,
    '',
    `Paradas físicas: ${r.stops.physical} (${r.stops.transferStops} con 2+ rutas, ` +
      `${r.stops.withoutAddress} sin dirección)`,
    `  paradas por ruta: ${r.stops.routeStops} (${r.stops.duplicateRecords} duplicados descartados, ` +
      `${r.stops.outOfOrder} fuera de orden)`,
    `  distancia parada→trazado: p50 ${r.stops.offsetToPathM.p50} m · p95 ${r.stops.offsetToPathM.p95} m · ` +
      `máx ${r.stops.offsetToPathM.max} m`,
    `Conexiones a pie (≤ ${r.footpaths.radiusM} m): ${r.footpaths.count}`,
  ];
  if (r.excludedRoutes.length > 0) {
    lines.push('', 'Rutas excluidas:');
    for (const e of r.excludedRoutes)
      lines.push(`  - ${e.code} ${e.name} (${e.routeId}): ${e.issue}`);
  }
  if (r.warnings.length > 0) {
    lines.push('', `Avisos (${r.warnings.length}):`);
    for (const w of r.warnings) lines.push(`  - ${w.code} ${w.name} (${w.routeId}): ${w.issue}`);
  }
  console.log(lines.join('\n'));
}

main();
