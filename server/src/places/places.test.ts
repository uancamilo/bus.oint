import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildApp } from '../app.ts';
import { config } from '../config.ts';
import { InMemoryNetworkStore } from '../network/network-store.ts';
import { addressMatchScore, parseAddress } from './address.ts';
import { SqliteGeocodeCache } from './geocode-cache.ts';
import { NominatimClient, type Fetcher } from './nominatim.ts';
import { PlaceSearchService } from './place-search.ts';

const network = InMemoryNetworkStore.fromFile(config.networkFile);
const knownPlaces = PlaceSearchService.loadKnownPlaces(config.placesFile);

/** Nominatim falso: cuenta las llamadas y responde un lugar fijo. */
function fakeNominatim(respond: () => Response = () => Response.json([OSM_ITEM])) {
  const calls: string[] = [];
  const fetcher: Fetcher = async (input) => {
    calls.push(String(input));
    return respond();
  };
  return { client: new NominatimClient(fetcher), calls };
}

const OSM_ITEM = {
  osm_type: 'way',
  osm_id: 42,
  lat: '6.2100',
  lon: '-75.5700',
  name: 'Sitio de prueba',
  display_name: 'Sitio de prueba, Calle 10, El Poblado, Medellín, Antioquia, Colombia',
  type: 'attraction',
  category: 'tourism',
};

function service(nominatim: NominatimClient | null = null) {
  return new PlaceSearchService(
    knownPlaces,
    network,
    new SqliteGeocodeCache(':memory:'),
    nominatim
  );
}

describe('parseAddress', () => {
  const cases: [string, string][] = [
    ['CR 68A x CL 78B, Medellin', 'cr 68a · cl 78b'],
    ['CL 50 66-50, Medellin', 'cl 50 · cr 66'],
    ['CR 9 9A-12, Medellin', 'cr 9 · cl 9a'],
    ['carrera 70 con calle 44', 'cr 70 · cl 44'],
    ['calle 10 # 43-25', 'cl 10 · cr 43'],
    ['Cra 65 b # 30', 'cr 65b · cl 30'],
    ['DG 79 9-133', 'dg 79 · tv 9'],
  ];
  for (const [input, expected] of cases) {
    it(`interpreta "${input}"`, () => {
      const parsed = parseAddress(input)
        .map((s) => `${s.type} ${s.number}`)
        .join(' · ');
      assert.equal(parsed, expected);
    });
  }

  it('puntúa cruces exactos, sin letra y de una sola vía', () => {
    const stop = parseAddress('CR 68A x CL 78B');
    assert.equal(addressMatchScore(parseAddress('carrera 68a calle 78b'), stop), 3);
    assert.equal(addressMatchScore(parseAddress('calle 78 carrera 68'), stop), 2);
    assert.equal(addressMatchScore(parseAddress('carrera 68a'), stop), 1);
    assert.equal(addressMatchScore(parseAddress('carrera 10 calle 20'), stop), 0);
  });
});

describe('PlaceSearchService (local)', () => {
  it('encuentra lugares conocidos por nombre y por alias, sin tildes', () => {
    const search = service();
    assert.equal(search.searchLocal('eafit', 5)[0]?.result.id, 'lugar:u-eafit');
    assert.equal(search.searchLocal('udea', 5)[0]?.result.id, 'lugar:u-udea');
    assert.equal(search.searchLocal('estacion poblado', 5)[0]?.result.id, 'lugar:metro-poblado');
  });

  it('encuentra paraderos por cruce de vías', () => {
    const stop = [...network.allStops()].find((s) => s.address?.includes(' x '))!;
    const [main, cross] = parseAddress(stop.address!);
    const words = {
      cl: 'calle',
      cr: 'carrera',
      cq: 'circular',
      dg: 'diagonal',
      tv: 'transversal',
      av: 'avenida',
    };
    const query = `${words[main!.type]} ${main!.number} con ${words[cross!.type]} ${cross!.number}`;
    const [first] = service().searchLocal(query, 5);
    assert.equal(first?.result.source, 'parada');
    assert.equal(first?.strong, true);
    assert.deepEqual(parseAddress(first!.result.name), parseAddress(stop.address!));
  });

  it('ignora consultas de menos de dos caracteres', () => {
    assert.deepEqual(service().searchLocal('a', 5), []);
  });
});

describe('PlaceSearchService (OpenStreetMap)', () => {
  it('no consulta afuera si no se pide o si hay coincidencia exacta', async () => {
    const { client, calls } = fakeNominatim();
    const search = service(client);
    await search.search('lugar raro', { external: false, limit: 5 });
    await search.search('Universidad EAFIT', { external: true, limit: 5 });
    assert.equal(calls.length, 0);
  });

  it('consulta Nominatim una sola vez y luego usa la caché', async () => {
    const { client, calls } = fakeNominatim();
    const search = service(client);
    const first = await search.search('Sitio de prueba', { external: true, limit: 5 });
    const second = await search.search('sitio  de PRUEBA', { external: true, limit: 5 });
    assert.equal(calls.length, 1);
    assert.match(calls[0]!, /viewbox=/);
    assert.deepEqual(first.external, { used: true, cached: false });
    assert.deepEqual(second.external, { used: true, cached: true });
    const osm = second.results.find((r) => r.source === 'osm');
    assert.equal(osm?.name, 'Sitio de prueba');
    assert.equal(osm?.lat, 6.21);
    assert.ok(second.attribution?.includes('OpenStreetMap'));
  });

  it('si Nominatim falla, devuelve lo local y explica el error', async () => {
    const { client } = fakeNominatim(() => new Response('caído', { status: 503 }));
    const result = await service(client).search('lugar inexistente', { external: true, limit: 5 });
    assert.equal(result.external.used, true);
    assert.match(result.external.error ?? '', /503/);
  });
});

describe('GET /lugares', () => {
  it('responde con resultados locales', async () => {
    const app = await buildApp({ network, places: service() });
    try {
      const response = await app.inject({ method: 'GET', url: '/lugares?q=plaza%20botero' });
      assert.equal(response.statusCode, 200);
      const body = response.json<{ results: { id: string }[]; external: { used: boolean } }>();
      assert.equal(body.results[0]?.id, 'lugar:p-plaza-botero');
      assert.equal(body.external.used, false);
      assert.equal((await app.inject({ method: 'GET', url: '/lugares' })).statusCode, 400);
    } finally {
      await app.close();
    }
  });
});
