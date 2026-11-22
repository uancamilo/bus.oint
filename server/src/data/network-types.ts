/**
 * Formato de `data/processed/network.json`, generado por `npm run data:build`
 * a partir de los GeoJSON oficiales de Medellín. Es lo que el servidor carga en memoria.
 */

export const NETWORK_FORMAT_VERSION = 1;

/** Sentido del recorrido: `ida` = Origen-Destino, `vuelta` = Destino-Origen. */
export type Direction = 'ida' | 'vuelta';

/** Coordenada geográfica compacta: [latitud, longitud]. */
export type LatLngTuple = [number, number];

/**
 * Tramo del circuito, medido en metros desde el inicio del trazado.
 * - `service`: el bus recorre la ruta y atiende paradas.
 * - `connector`: hueco corto (≤ umbral) entre sentidos; el bus se ve avanzar en línea recta.
 * - `deadhead`: hueco largo; el bus no se dibuja mientras lo recorre (va a la terminal).
 */
export type CircuitSegment =
  | { kind: 'service'; direction: Direction; startM: number; endM: number }
  | { kind: 'connector' | 'deadhead'; startM: number; endM: number };

export interface RouteStop {
  /** `id` de la parada física (`id_paradero` en los datos oficiales). */
  stopId: string;
  direction: Direction;
  /** Orden oficial de la parada dentro del sentido (`nro_parada`). */
  seq: number;
  /** Posición sobre el circuito, en metros desde el inicio del trazado. */
  atM: number;
  /** Distancia de la parada al trazado (metros); sirve para control de calidad. */
  offsetM: number;
}

export interface Route {
  /** `id_ruta` oficial, por ejemplo "90223". */
  id: string;
  /** Código visible en el bus, por ejemplo "304" o "51-52 CV-O". */
  code: string;
  name: string;
  company: string;
  /** Directa Centro, Integrada, Circular o Directa No Centro. */
  type: string;
  system: string;
  /** Longitud total del circuito cerrado (ida + vuelta + huecos), en metros. */
  lengthM: number;
  /** Trazado del circuito; el último punto coincide con el primero. */
  path: LatLngTuple[];
  segments: CircuitSegment[];
  /** Paradas ordenadas por posición sobre el circuito. Vacío si la ruta no tiene paradas. */
  stops: RouteStop[];
}

export interface Stop {
  id: string;
  /** Dirección oficial, por ejemplo "CR 68A x CL 78B, Medellin". Puede faltar. */
  address: string | null;
  lat: number;
  lng: number;
  /** Rutas que atienden esta parada. */
  routeIds: string[];
}

/** Conexión a pie entre dos paradas cercanas: [stopIdA, stopIdB, metros en línea recta]. */
export type Footpath = [string, string, number];

export interface NetworkData {
  version: typeof NETWORK_FORMAT_VERSION;
  generatedAt: string;
  sources: {
    routes: { file: string; updatedAt: string };
    stops: { file: string; updatedFrom: string; updatedTo: string };
  };
  routes: Route[];
  stops: Stop[];
  footpaths: Footpath[];
}
