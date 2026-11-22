import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { buildApp } from './app.ts';
import { config } from './config.ts';
import { InMemoryNetworkStore } from './network/network-store.ts';

// Usa la red real generada por `npm run data:build`.
const network = InMemoryNetworkStore.fromFile(config.networkFile);
let app: Awaited<ReturnType<typeof buildApp>>;

before(async () => {
  app = await buildApp({ network });
  await app.ready();
});
after(() => app.close());

const get = async <T>(url: string) => {
  const response = await app.inject({ method: 'GET', url });
  return { status: response.statusCode, body: response.json<T>() };
};

interface RouteSummary {
  id: string;
  code: string;
  name: string;
  type: string;
  plannable: boolean;
}

describe('GET /health', () => {
  it('informa el estado y la red cargada', async () => {
    const { status, body } = await get<{ status: string; network: { routes: number } }>('/health');
    assert.equal(status, 200);
    assert.equal(body.status, 'ok');
    assert.equal(body.network.routes, network.info.routes);
  });
});

describe('GET /rutas', () => {
  it('lista todas las rutas sin filtro', async () => {
    const { status, body } = await get<RouteSummary[]>('/rutas');
    assert.equal(status, 200);
    assert.equal(body.length, network.info.routes);
  });

  it('pone primero la coincidencia exacta de código', async () => {
    const { body } = await get<RouteSummary[]>('/rutas?q=304');
    assert.equal(body[0]?.code, '304');
  });

  it('busca por nombre sin importar tildes ni mayúsculas', async () => {
    const { body } = await get<RouteSummary[]>('/rutas?q=SAN JAVIER');
    assert.ok(body.length > 0);
    assert.ok(body.every((r) => /san javier/i.test(r.name.normalize('NFD'))));
  });

  it('filtra por tipo', async () => {
    const { body } = await get<RouteSummary[]>('/rutas?tipo=circular');
    assert.ok(body.length > 0);
    assert.ok(body.every((r) => r.type === 'Circular'));
  });

  it('rechaza un límite inválido', async () => {
    const { status } = await get('/rutas?limite=0');
    assert.equal(status, 400);
  });
});

describe('GET /rutas/:id', () => {
  it('devuelve trazado cerrado, tramos y paradas ordenadas', async () => {
    const [summary] = (await get<RouteSummary[]>('/rutas?q=304')).body;
    const { status, body } = await get<{
      path: [number, number][];
      segments: { kind: string }[];
      stops: { atM: number; lat: number }[];
      bounds: { north: number; south: number };
    }>(`/rutas/${summary!.id}`);
    assert.equal(status, 200);
    assert.ok(body.path.length > 10);
    assert.deepEqual(body.path[0], body.path.at(-1));
    assert.equal(body.segments.filter((s) => s.kind === 'service').length, 2);
    assert.ok(body.stops.length > 0);
    assert.ok(body.stops.every((s, i) => i === 0 || s.atM >= body.stops[i - 1]!.atM));
    assert.ok(body.bounds.north > body.bounds.south);
  });

  it('responde 404 si la ruta no existe', async () => {
    const { status, body } = await get<{ error: string }>('/rutas/no-existe');
    assert.equal(status, 404);
    assert.equal(body.error, 'not_found');
  });
});

describe('GET /paradas', () => {
  // Parque Berrío, centro de Medellín.
  const center = { lat: 6.2501, lng: -75.5684 };

  it('encuentra paradas cercanas ordenadas por distancia y dentro del radio', async () => {
    const { status, body } = await get<{ distanceM: number; routes: unknown[] }[]>(
      `/paradas/cercanas?lat=${center.lat}&lng=${center.lng}&radio=400`
    );
    assert.equal(status, 200);
    assert.ok(body.length > 0);
    assert.ok(
      body.every((s, i) => s.distanceM <= 400 && (i === 0 || s.distanceM >= body[i - 1]!.distanceM))
    );
    assert.ok(body.every((s) => s.routes.length > 0));
  });

  it('rechaza coordenadas fuera del Valle de Aburrá', async () => {
    const { status } = await get('/paradas/cercanas?lat=4.6&lng=-74.08');
    assert.equal(status, 400);
  });

  it('devuelve el detalle de una parada con sus rutas', async () => {
    const [nearest] = (
      await get<{ id: string }[]>(`/paradas/cercanas?lat=${center.lat}&lng=${center.lng}`)
    ).body;
    const { status, body } = await get<{ id: string; routes: unknown[] }>(
      `/paradas/${nearest!.id}`
    );
    assert.equal(status, 200);
    assert.equal(body.id, nearest!.id);
    assert.ok(body.routes.length > 0);
  });
});

describe('GET /docs', () => {
  it('publica la especificación OpenAPI', async () => {
    const { status, body } = await get<{ paths: Record<string, unknown> }>('/docs/json');
    assert.equal(status, 200);
    assert.ok('/rutas' in body.paths && '/paradas/cercanas' in body.paths);
  });
});
