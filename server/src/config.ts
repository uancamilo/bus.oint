import path from 'node:path';

const SERVER_ROOT = path.resolve(import.meta.dirname, '..');

function parseIntEnv(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value))
    throw new Error(`${name} debe ser un número entero (llegó "${raw}")`);
  return value;
}

export const config = {
  /** 0.0.0.0 para que el celular con Expo Go pueda conectarse por la red Wi-Fi. */
  host: process.env.HOST ?? '0.0.0.0',
  port: parseIntEnv('PORT', process.env.PORT, 3000),
  simulation: {
    /** Distancia entre buses consecutivos de una ruta (metros). */
    spacingM: parseIntEnv('BUS_SPACING_M', process.env.BUS_SPACING_M, 2000),
    /** Velocidad comercial promedio de los buses (km/h). */
    speedKmh: parseIntEnv('BUS_SPEED_KMH', process.env.BUS_SPEED_KMH, 18),
  },
  planner: {
    /** Distancia máxima a pie hasta/desde una parada (metros, línea recta). */
    maxWalkM: parseIntEnv('MAX_WALK_M', process.env.MAX_WALK_M, 500),
  },
  /** Cada cuánto se envían posiciones por WebSocket (ms). */
  tickMs: parseIntEnv('TICK_MS', process.env.TICK_MS, 1000),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  networkFile:
    process.env.NETWORK_FILE ?? path.resolve(SERVER_ROOT, '../data/processed/network.json'),
  /** Lugares conocidos geocodificados (`npm run places:build`). */
  placesFile: process.env.PLACES_FILE ?? path.resolve(SERVER_ROOT, '../data/places/lugares.json'),
  /** Base SQLite local (caché de búsquedas). Se crea sola; git la ignora. */
  dbFile: process.env.DB_FILE ?? path.resolve(SERVER_ROOT, 'var/bus-point.sqlite'),
  /** `false` desactiva la búsqueda en OpenStreetMap (modo sin internet). */
  nominatimEnabled: process.env.NOMINATIM_ENABLED !== 'false',
};
