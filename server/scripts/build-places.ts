/**
 * Geocodifica la lista curada de lugares conocidos con Nominatim (OpenStreetMap) y genera
 * `data/places/lugares.json`, que el servidor usa para buscar destinos sin internet.
 *
 *   npm run places:build            solo consulta los lugares nuevos o con consultas cambiadas
 *   npm run places:build -- --force vuelve a consultarlos todos
 *
 * Para evitar falsos positivos (p. ej. "Estación Floresta" → estación de bomberos), solo se
 * acepta un resultado cuyo tipo OSM corresponda a la categoría del lugar. Cada lugar puede
 * tener varias consultas; se prueban en orden hasta encontrar un resultado aceptable.
 *
 * Respeta la política de Nominatim: 1 consulta por segundo e identificación de la aplicación.
 * Las coordenadas vienen de OpenStreetMap (© OpenStreetMap contributors, licencia ODbL).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { NominatimClient, OSM_ATTRIBUTION, type GeocodedPlace } from '../src/places/nominatim.ts';
import type { KnownPlace } from '../src/places/places-types.ts';
import { normalizeText } from '../src/text.ts';

const PLACES_DIR = path.resolve(import.meta.dirname, '../../data/places');
const SOURCE_FILE = path.join(PLACES_DIR, 'lugares-fuente.json');
const OUTPUT_FILE = path.join(PLACES_DIR, 'lugares.json');

interface SourcePlace {
  id: string;
  name: string;
  category: string;
  /** Una consulta o varias alternativas, en orden de preferencia. */
  query: string | string[];
  aliases?: string[];
}

/** Tipos OSM aceptables por categoría, en orden de preferencia. */
const ACCEPTED_KINDS: Record<string, string[]> = {
  metro: ['station', 'halt', 'stop_position', 'platform'],
  universidad: ['university', 'college', 'school'],
  'centro comercial': ['mall', 'department_store', 'commercial', 'retail'],
  parque: [
    'park',
    'square',
    'garden',
    'recreation_ground',
    'pedestrian',
    'commercial',
    'neighbourhood',
    'quarter',
  ],
  cultura: [
    'museum',
    'theatre',
    'planetarium',
    'library',
    'arts_centre',
    'attraction',
    'events_venue',
    'exhibition_centre',
    'conference_centre',
    'commercial',
    'park',
  ],
  deporte: ['stadium', 'sports_centre', 'pitch'],
  gobierno: ['townhall', 'public_building', 'government', 'commercial', 'office'],
  transporte: ['aerodrome', 'bus_station', 'station', 'terminal'],
  salud: ['hospital', 'clinic'],
};

const force = process.argv.includes('--force');
const sources = JSON.parse(readFileSync(SOURCE_FILE, 'utf8')) as SourcePlace[];
const previous = new Map<string, KnownPlace>(
  existsSync(OUTPUT_FILE)
    ? (JSON.parse(readFileSync(OUTPUT_FILE, 'utf8')) as { places: KnownPlace[] }).places.map(
        (p) => [p.id, p]
      )
    : []
);

const client = new NominatimClient();
const places: KnownPlace[] = [];
const missing: SourcePlace[] = [];
let requests = 0;

/**
 * Elige el primer resultado de un tipo aceptable. En el Metro además exige que el nombre
 * OSM contenga el de la estación: la búsqueda libre a veces devuelve la estación vecina
 * (p. ej. "Aguacatala" → "Estación Metro Poblado").
 */
function pickAcceptable(results: GeocodedPlace[], source: SourcePlace): GeocodedPlace | undefined {
  const accepted = ACCEPTED_KINDS[source.category] ?? [];
  const stationName = normalizeText(source.name.replace(/^Estación /, ''));
  const nameMatches = (r: GeocodedPlace) =>
    source.category !== 'metro' || normalizeText(r.name).includes(stationName);
  for (const kind of accepted) {
    const match = results.find((r) => r.kind === kind && nameMatches(r));
    if (match) return match;
  }
  return undefined;
}

for (const source of sources) {
  const queries = Array.isArray(source.query) ? source.query : [source.query];
  const queryKey = queries.join(' | ');
  const cached = previous.get(source.id);
  if (!force && cached && cached.osm.query === queryKey) {
    places.push({
      ...cached,
      name: source.name,
      category: source.category,
      aliases: source.aliases ?? [],
    });
    continue;
  }

  process.stdout.write(`  ${source.name}… `);
  let found: GeocodedPlace | undefined;
  for (const query of queries) {
    try {
      requests++;
      found = pickAcceptable(await client.search(query, 10), source);
    } catch (error) {
      process.stdout.write(`(error: ${(error as Error).message}) `);
    }
    if (found) break;
  }
  if (!found) {
    console.log('sin resultado aceptable');
    missing.push(source);
    continue;
  }
  console.log(`${found.lat.toFixed(5)}, ${found.lng.toFixed(5)} (${found.osmClass}=${found.kind})`);
  places.push({
    id: source.id,
    name: source.name,
    category: source.category,
    aliases: source.aliases ?? [],
    lat: found.lat,
    lng: found.lng,
    osm: { id: found.osmId, kind: found.kind, displayName: found.displayName, query: queryKey },
  });
}

writeFileSync(
  OUTPUT_FILE,
  JSON.stringify(
    { attribution: OSM_ATTRIBUTION, generatedAt: new Date().toISOString(), places },
    null,
    2
  ) + '\n'
);

console.log(
  `\n${places.length} de ${sources.length} lugares en data/places/lugares.json ` +
    `(${requests} consultas a Nominatim)`
);
if (missing.length > 0) {
  // Aviso, no error: el servidor funciona con los lugares encontrados.
  console.log('Sin coordenadas (ajusta sus consultas en lugares-fuente.json):');
  for (const m of missing) console.log(`  - ${m.id}: ${JSON.stringify(m.query)}`);
}
