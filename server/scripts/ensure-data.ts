/**
 * Se ejecuta antes de `npm run dev`, `npm start` y `npm test`: genera la red procesada si
 * no existe o si alguno de los GeoJSON oficiales es más reciente. Así, después de clonar el
 * repositorio basta con `npm install && npm run dev`.
 */
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(import.meta.dirname, '../../data');
const OUTPUT = path.join(DATA_DIR, 'processed/network.json');
const SOURCES = ['rutas_de_transporte_publi.geojson', 'paradas_de_transporte_pub.geojson'].map(
  (file) => path.join(DATA_DIR, file)
);

const outdated =
  !existsSync(OUTPUT) ||
  SOURCES.some((source) => statSync(source).mtimeMs > statSync(OUTPUT).mtimeMs);

if (outdated) {
  console.log('Generando la red de transporte a partir de los datos oficiales…\n');
  await import('./build-data.ts');
}
