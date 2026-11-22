/**
 * Cliente mínimo de Nominatim (buscador de OpenStreetMap), respetando su política de uso:
 * https://operations.osmfoundation.org/policies/nominatim/
 *
 *  - Máximo 1 consulta por segundo (las consultas se encolan).
 *  - Identificación de la aplicación en el User-Agent.
 *  - Nada de autocompletar: solo se consulta cuando el usuario pulsa "Buscar".
 *  - Los resultados se guardan en caché (ver geocode-cache.ts) y se atribuyen a OSM.
 */

export const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
export const USER_AGENT = 'bus.point-prototipo/0.1 (proyecto academico, Medellin)';
export const OSM_ATTRIBUTION = '© OpenStreetMap contributors (ODbL)';

/** Valle de Aburrá con margen: oeste, norte, este, sur. */
export const VALLE_DE_ABURRA_VIEWBOX = '-75.72,6.42,-75.42,6.08';

const MIN_INTERVAL_MS = 1100;

export interface GeocodedPlace {
  name: string;
  /** Dirección o descripción completa que devuelve OSM. */
  displayName: string;
  lat: number;
  lng: number;
  /** Tipo OSM, por ejemplo "station", "university", "mall". */
  kind: string;
  /** Clase OSM, por ejemplo "railway", "amenity", "shop". */
  osmClass: string;
  osmId: string;
}

export type Fetcher = typeof fetch;

interface NominatimItem {
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  type?: string;
  category?: string;
}

export class NominatimClient {
  private queue: Promise<unknown> = Promise.resolve();
  private lastRequestAt = 0;

  constructor(
    private readonly fetcher: Fetcher = fetch,
    private readonly timeoutMs = 6000
  ) {}

  /** Busca un lugar dentro del Valle de Aburrá. Las llamadas se serializan a 1 por segundo. */
  search(query: string, limit = 5): Promise<GeocodedPlace[]> {
    const run = this.queue.then(() => this.request(query, limit));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async request(query: string, limit: number): Promise<GeocodedPlace[]> {
    const wait = this.lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    this.lastRequestAt = Date.now();

    const url = new URL(NOMINATIM_URL);
    url.search = new URLSearchParams({
      q: query,
      format: 'jsonv2',
      countrycodes: 'co',
      viewbox: VALLE_DE_ABURRA_VIEWBOX,
      bounded: '1',
      limit: String(limit),
      'accept-language': 'es',
    }).toString();

    const response = await this.fetcher(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) throw new Error(`Nominatim respondió ${response.status}`);
    const items = (await response.json()) as NominatimItem[];
    return items.map((item) => ({
      name: item.name || item.display_name.split(',')[0]!.trim(),
      displayName: item.display_name,
      lat: Number(item.lat),
      lng: Number(item.lon),
      kind: item.type ?? 'unknown',
      osmClass: item.category ?? 'unknown',
      osmId: `${item.osm_type}/${item.osm_id}`,
    }));
  }
}
