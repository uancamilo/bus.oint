/**
 * Búsqueda de destinos ("¿para dónde vas?"), en dos niveles:
 *
 *  1. Local, instantánea y sin internet: lugares conocidos (Metro, universidades, centros
 *     comerciales…) y direcciones de los 3.500 paraderos oficiales. Sirve para autocompletar.
 *  2. Externa (solo al pulsar "Buscar" y si lo local no basta): Nominatim de OpenStreetMap,
 *     con los resultados guardados en caché para no repetir consultas.
 */
import { existsSync, readFileSync } from 'node:fs';

import type { NetworkRepository } from '../network/network-store.ts';
import { normalizeText } from '../text.ts';
import { addressMatchScore, parseAddress, shortAddress, type Street } from './address.ts';
import type { GeocodeCache } from './geocode-cache.ts';
import { OSM_ATTRIBUTION, type NominatimClient } from './nominatim.ts';
import type { KnownPlace, PlaceResult } from './places-types.ts';

export interface PlaceSearchResponse {
  results: PlaceResult[];
  external: {
    /** Se consultó (o se reutilizó de la caché) el buscador externo. */
    used: boolean;
    cached: boolean;
    error?: string;
  };
  /** Atribución obligatoria cuando hay resultados de OpenStreetMap. */
  attribution?: string;
}

interface IndexedPlace {
  place: KnownPlace;
  names: string[];
}

interface IndexedStop {
  result: PlaceResult;
  streets: Street[];
  text: string;
}

interface Scored {
  result: PlaceResult;
  score: number;
  /** Coincidencia exacta: nombre o alias completo, o cruce de vías exacto. */
  strong: boolean;
}

export class PlaceSearchService {
  private readonly places: IndexedPlace[];
  private readonly stops: IndexedStop[] = [];

  constructor(
    knownPlaces: KnownPlace[],
    network: NetworkRepository,
    private readonly cache: GeocodeCache,
    /** `null` desactiva la búsqueda externa (modo sin internet). */
    private readonly nominatim: NominatimClient | null
  ) {
    this.places = knownPlaces.map((place) => ({
      place,
      names: [place.name, ...place.aliases].map(normalizeText),
    }));

    // Una entrada por dirección distinta (varios paraderos pueden compartirla).
    const seen = new Set<string>();
    for (const stop of network.allStops()) {
      if (!stop.address) continue;
      const label = shortAddress(stop.address);
      if (seen.has(label)) continue;
      seen.add(label);
      this.stops.push({
        result: {
          id: `parada:${stop.id}`,
          name: label,
          detail: 'Paradero de bus',
          lat: stop.lat,
          lng: stop.lng,
          source: 'parada',
        },
        streets: parseAddress(stop.address),
        text: normalizeText(label),
      });
    }
  }

  static loadKnownPlaces(file: string): KnownPlace[] {
    if (!existsSync(file)) return [];
    return (JSON.parse(readFileSync(file, 'utf8')) as { places: KnownPlace[] }).places;
  }

  get knownPlaceCount(): number {
    return this.places.length;
  }

  /** Solo local: rápido y apto para autocompletar mientras el usuario escribe. */
  searchLocal(query: string, limit: number): Scored[] {
    const q = normalizeText(query);
    if (q.length < 2) return [];
    const scored = [...this.matchPlaces(q), ...this.matchStops(query, q)];
    return scored.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /**
   * Búsqueda completa. Con `external` consulta Nominatim cuando no hay una coincidencia local
   * exacta; si Nominatim falla, devuelve lo local y explica el error.
   */
  async search(query: string, { external, limit }: { external: boolean; limit: number }) {
    const local = this.searchLocal(query, limit);
    const response: PlaceSearchResponse = {
      results: local.map((s) => s.result),
      external: { used: false, cached: false },
    };
    const hasStrongMatch = local.some((s) => s.strong);
    if (!external || hasStrongMatch || !this.nominatim || normalizeText(query).length < 3) {
      return response;
    }

    const key = normalizeText(query);
    let remote = this.cache.get(key);
    response.external = { used: true, cached: remote !== undefined };
    if (!remote) {
      try {
        remote = (await this.nominatim.search(query, limit)).map((place): PlaceResult => ({
          id: `osm:${place.osmId}`,
          name: place.name,
          detail: place.displayName.split(',').slice(1, 4).join(',').trim(),
          lat: place.lat,
          lng: place.lng,
          source: 'osm',
        }));
        this.cache.set(key, remote);
      } catch (error) {
        response.external.error = `No se pudo consultar OpenStreetMap: ${(error as Error).message}`;
        return response;
      }
    }
    const known = new Set(response.results.map((r) => r.id));
    response.results = [...response.results, ...remote.filter((r) => !known.has(r.id))].slice(
      0,
      limit
    );
    if (remote.length > 0) response.attribution = OSM_ATTRIBUTION;
    return response;
  }

  private matchPlaces(q: string): Scored[] {
    const tokens = q.split(' ');
    const result: Scored[] = [];
    for (const { place, names } of this.places) {
      let score = 0;
      for (const name of names) {
        if (name === q) score = Math.max(score, 5);
        else if (name.startsWith(q)) score = Math.max(score, 4);
        else if (name.split(' ').some((w) => w.startsWith(q))) score = Math.max(score, 3);
        else if (tokens.every((t) => name.includes(t))) score = Math.max(score, 2);
      }
      if (score > 0) {
        result.push({
          score,
          strong: score >= 4,
          result: {
            id: `lugar:${place.id}`,
            name: place.name,
            detail: capitalize(place.category),
            lat: place.lat,
            lng: place.lng,
            source: 'lugar',
          },
        });
      }
    }
    return result;
  }

  private matchStops(rawQuery: string, q: string): Scored[] {
    const streets = parseAddress(rawQuery);
    const result: Scored[] = [];
    for (const stop of this.stops) {
      // Dirección interpretada: 3 = cruce exacto, 2 = cruce sin letra, 1 = misma vía.
      let score = streets.length > 0 ? addressMatchScore(streets, stop.streets) : 0;
      // Texto libre como respaldo ("68a x 78").
      if (score === 0 && q.length >= 3 && stop.text.includes(q)) score = 1;
      if (score > 0) result.push({ score, strong: score >= 3, result: stop.result });
    }
    return result;
  }
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
