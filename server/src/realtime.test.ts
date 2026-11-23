import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { buildApp } from './app.ts';
import { config } from './config.ts';
import { InMemoryNetworkStore } from './network/network-store.ts';

const network = InMemoryNetworkStore.fromFile(config.networkFile);
const NOW = 1_800_000_000_000;
let app: Awaited<ReturnType<typeof buildApp>>;

before(async () => {
  app = await buildApp({ network, clock: () => NOW, tickMs: 50 });
  await app.ready();
});
after(() => app.close());

const routeId = network.searchRoutes({ query: '190', limit: 1 })[0]!.id;

const get = async <T>(url: string) => {
  const response = await app.inject({ method: 'GET', url });
  return { status: response.statusCode, body: response.json<T>() };
};

interface BusDto {
  id: string;
  routeId: string;
  lat: number;
  visible: boolean;
  nextStop: { etaS: number } | null;
}

describe('GET /rutas/:id/buses', () => {
  it('devuelve los buses simulados de la ruta', async () => {
    const { status, body } = await get<{ at: number; buses: BusDto[] }>(`/rutas/${routeId}/buses`);
    assert.equal(status, 200);
    assert.equal(body.at, NOW);
    assert.ok(body.buses.length >= 2);
    assert.ok(body.buses.every((b) => b.routeId === routeId && b.lat > 6 && b.lat < 6.5));
  });

  it('responde 404 para una ruta inexistente', async () => {
    assert.equal((await get('/rutas/nada/buses')).status, 404);
  });
});

describe('GET /paradas/:id/llegadas', () => {
  it('lista los próximos buses de cada ruta, del más pronto al más tardío', async () => {
    const route = network.getRoute(routeId)!;
    const stopId = route.stops[0]!.stopId;
    const { status, body } = await get<{
      routes: { route: { id: string }; arrivals: { etaS: number }[] }[];
    }>(`/paradas/${stopId}/llegadas?proximos=2`);
    assert.equal(status, 200);
    const entry = body.routes.find((r) => r.route.id === routeId);
    assert.ok(entry);
    assert.equal(entry.arrivals.length, 2);
    assert.ok(entry.arrivals[0]!.etaS <= entry.arrivals[1]!.etaS);
    const firsts = body.routes.map((r) => r.arrivals[0]!.etaS);
    assert.deepEqual(
      firsts,
      [...firsts].sort((a, b) => a - b)
    );
  });
});

describe('GET /health', () => {
  it('incluye el estado de la simulación', async () => {
    const { body } = await get<{ simulation: { buses: number; spacingM: number } }>('/health');
    assert.ok(body.simulation.buses > network.info.routes);
    assert.equal(body.simulation.spacingM, 2000);
  });
});

describe('WebSocket /tiempo-real', () => {
  /**
   * Abre un WebSocket de prueba y devuelve una función para esperar mensajes por tipo.
   * El listener se registra en `onInit` para no perder el `welcome`, que el servidor
   * envía apenas se establece la conexión.
   */
  async function connect() {
    const messages: { type: string; [key: string]: unknown }[] = [];
    const waiters: (() => void)[] = [];
    const ws = await app.injectWS(
      '/tiempo-real',
      {},
      {
        onInit: (socket) =>
          socket.on('message', (data) => {
            messages.push(JSON.parse(String(data)));
            waiters.splice(0).forEach((wake) => wake());
          }),
      }
    );
    async function next(type: string) {
      for (;;) {
        const index = messages.findIndex((m) => m.type === type);
        if (index !== -1) return messages.splice(index, 1)[0]!;
        await new Promise<void>((resolve) => waiters.push(resolve));
      }
    }
    return { ws, next };
  }

  it('saluda, confirma la suscripción y envía buses periódicamente', async () => {
    const { ws, next } = await connect();
    try {
      const welcome = await next('welcome');
      assert.equal(welcome.tickMs, 50);

      ws.send(JSON.stringify({ type: 'subscribe', routeIds: [routeId, 'no-existe'] }));
      const subscribed = await next('subscribed');
      assert.deepEqual(subscribed.routeIds, [routeId]);
      assert.deepEqual(subscribed.unknownRouteIds, ['no-existe']);

      const first = (await next('buses')) as unknown as { routes: Record<string, BusDto[]> };
      assert.deepEqual(Object.keys(first.routes), [routeId]);
      assert.ok(first.routes[routeId]!.length >= 2);

      // Llega un segundo envío por el temporizador.
      await next('buses');
    } finally {
      ws.terminate();
    }
  });

  it('responde con error ante mensajes inválidos o demasiadas rutas', async () => {
    const { ws, next } = await connect();
    try {
      await next('welcome');
      ws.send('esto no es json');
      assert.match(String((await next('error')).message), /JSON/);

      ws.send(
        JSON.stringify({
          type: 'subscribe',
          routeIds: Array.from({ length: 21 }, (_, i) => `${i}`),
        })
      );
      assert.match(String((await next('error')).message), /Máximo 20/);
    } finally {
      ws.terminate();
    }
  });
});
