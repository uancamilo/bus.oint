/**
 * Utilidades geométricas planas.
 *
 * Todas las funciones que reciben `Xy` trabajan en metros sobre un plano proyectado
 * (EPSG:9377, MAGNA-SIRGAS Origen Nacional). En el Valle de Aburrá la distorsión de esa
 * proyección es de ~0,02 %, así que las distancias planas son prácticamente reales.
 */

export type Xy = readonly [number, number];

export function distance(a: Xy, b: Xy): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/** Distancia acumulada desde el primer punto hasta cada vértice. */
export function cumulativeLengths(points: readonly Xy[]): number[] {
  const result: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    result.push(result[i - 1]! + distance(points[i - 1]!, points[i]!));
  }
  return result;
}

export function polylineLength(points: readonly Xy[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distance(points[i - 1]!, points[i]!);
  return total;
}

export interface PolylineProjection {
  /** Índice del vértice inicial del segmento donde cae la proyección. */
  segmentIndex: number;
  /** Distancia del punto a la línea (metros). */
  offset: number;
  /** Distancia recorrida sobre la línea hasta la proyección (metros). */
  along: number;
}

/**
 * Proyecta un punto sobre los segmentos [fromIndex, toIndex) de una polilínea.
 * `cumulative` debe ser el resultado de `cumulativeLengths(points)`.
 * `minAlong` descarta proyecciones que queden antes de esa distancia.
 */
export function projectOnPolyline(
  point: Xy,
  points: readonly Xy[],
  cumulative: readonly number[],
  fromIndex = 0,
  toIndex = points.length - 1,
  minAlong = Number.NEGATIVE_INFINITY
): PolylineProjection | null {
  let best: PolylineProjection | null = null;
  for (let i = fromIndex; i < toIndex; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lengthSq = dx * dx + dy * dy;
    let t = lengthSq === 0 ? 0 : ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));
    const along = cumulative[i]! + t * Math.sqrt(lengthSq);
    if (along < minAlong) continue;
    const offset = Math.hypot(point[0] - (a[0] + t * dx), point[1] - (a[1] + t * dy));
    if (best === null || offset < best.offset) best = { segmentIndex: i, offset, along };
  }
  return best;
}

/** Simplificación Douglas-Peucker (iterativa) con tolerancia en metros. */
export function simplify(points: readonly Xy[], tolerance: number): Xy[] {
  if (points.length <= 2) return [...points];
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    const a = points[start]!;
    const b = points[end]!;
    let maxDistance = 0;
    let maxIndex = -1;
    for (let i = start + 1; i < end; i++) {
      const d = distanceToSegment(points[i]!, a, b);
      if (d > maxDistance) {
        maxDistance = d;
        maxIndex = i;
      }
    }
    if (maxIndex !== -1 && maxDistance > tolerance) {
      keep[maxIndex] = 1;
      stack.push([start, maxIndex], [maxIndex, end]);
    }
  }
  return points.filter((_, i) => keep[i] === 1);
}

function distanceToSegment(p: Xy, a: Xy, b: Xy): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return distance(p, a);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSq));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

const EARTH_RADIUS_M = 6_371_008.8;

/** Distancia de gran círculo entre dos coordenadas geográficas (metros). */
export function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLng = (lng2 - lng1) * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}
