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
  logLevel: process.env.LOG_LEVEL ?? 'info',
  networkFile:
    process.env.NETWORK_FILE ?? path.resolve(SERVER_ROOT, '../data/processed/network.json'),
};
