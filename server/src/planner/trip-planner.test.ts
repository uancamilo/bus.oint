import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildApp } from '../app.ts';
import { config } from '../config.ts';
import {
  NETWORK_FORMAT_VERSION,
  type NetworkData,
  type Route,
  type Stop,
} from '../data/network-types.ts';
import { haversine } from '../geo/geometry.ts';
import { InMemoryNetworkStore } from '../network/network-store.ts';
import { BusSimulator } from '../simulation/bus-simulator.ts';
import { TripPlanner, type Journey } from './trip-planner.ts';

/*
 * Red sintética en forma de "L":
 *
 *   B3 (6.22)
 *    |  ruta B (norte)
 *   B2
 *    |
 *   X ───── A2 ───── A1        ruta A (oriente → occidente en la vuelta)
 * (6.20, -75.58)    (6.20, -75.60)
 *
 * A va de A1 a X (ida) y regresa; B va de X a B3 (ida) y regresa. Para ir de A1 a B3 hay
 * que transbordar en X.
 */
type LatLng = [number, number];
const A1: LatLng = [6.2, -75.6];
const A2: LatLng = [6.2, -75.59];
const X: LatLng = [6.2, -75.58];
const B2: LatLng = [6.21, -75.58];
const B3: LatLng = [6.22, -75.58];

function lineRoute(id: string, from: LatLng, to: LatLng, idaStops: [string, number][]): Route {
  const leg = haversine(...from, ...to);
  const length = Math.round(2 * leg);
  return {
    id,
    code: id,
    name: `Ruta ${id}`,
    company: 'Pruebas',
    type: 'Directa Centro',
    system: 'T',
    lengthM: length,
    path: [from, to, from],
    segments: [
      { kind: 'service', direction: 'ida', startM: 0, endM: length / 2 },
      { kind: 'service', direction: 'vuelta', startM: length / 2, endM: length },
    ],
    stops: [
      ...idaStops.map(([stopId, f], i) => ({
        stopId,
        direction: 'ida' as const,
        seq: i + 1,
        atM: f * (length / 2),
        offsetM: 0,
      })),
      ...idaStops.toReversed().map(([stopId, f], i) => ({
        stopId,
        direction: 'vuelta' as const,
        seq: i + 1,
        atM: length / 2 + (1 - f) * (length / 2),
        offsetM: 0,
      })),
    ].sort((a, b) => a.atM - b.atM),
  };
}

const stop = (id: string, [lat, lng]: LatLng, routeIds: string[]): Stop => ({
  id,
  address: `Parada ${id}`,
  lat,
  lng,
  routeIds,
});

const data: NetworkData = {
  version: NETWORK_FORMAT_VERSION,
  generatedAt: '2026-01-01T00:00:00.000Z',
  sources: {
    routes: { file: 'test', updatedAt: '2026-01-01' },
    stops: { file: 'test', updatedFrom: '2026-01-01', updatedTo: '2026-01-01' },
  },
  routes: [
    lineRoute('A', A1, X, [
      ['A1', 0],
      ['A2', 0.5],
      ['X', 1],
    ]),
    lineRoute('B', X, B3, [
      ['X', 0],
      ['B2', 0.5],
      ['B3', 1],
    ]),
  ],
  stops: [
    stop('A1', A1, ['A']),
    stop('A2', A2, ['A']),
    stop('X', X, ['A', 'B']),
    stop('B2', B2, ['B']),
    stop('B3', B3, ['B']),
  ],
  footpaths: [],
};

const NOW = 1_800_000_000_000;
const network = new InMemoryNetworkStore(data);
const simulator = new BusSimulator(network, { spacingM: 500, speedKmh: 18 }, () => NOW);
const planner = new TripPlanner(network, simulator);
const near = ([lat, lng]: LatLng) => ({ lat: lat + 0.0005, lng });

function assertConsistent(journey: Journey) {
  let t = NOW;
  for (const leg of journey.legs) {
    assert.ok(leg.departAt >= t - 1, 'cada tramo empieza después del anterior');
    assert.ok(leg.arriveAt >= leg.departAt);
    if (leg.type === 'bus') assert.ok(leg.waitS >= 0);
    t = leg.arriveAt;
  }
  assert.equal(journey.arriveAt, t);
}

describe('TripPlanner', () => {
  it('encuentra el viaje directo', () => {
    const { journeys } = planner.plan(near(A1), near(A2), NOW);
    const [first] = journeys;
    assert.deepEqual(first?.routeCodes, ['A']);
    assert.equal(first?.transfers, 0);
    const bus = first!.legs.find((l) => l.type === 'bus')!;
    assert.equal(bus.from.stopId, 'A1');
    assert.equal(bus.to.stopId, 'A2');
    assertConsistent(first!);
  });

  it('transborda en la parada compartida', () => {
    const { journeys } = planner.plan(near(A1), near(B3), NOW);
    const transfer = journeys.find((j) => j.transfers === 1);
    assert.ok(transfer, 'debe haber una opción con un transbordo');
    assert.deepEqual(transfer.routeCodes, ['A', 'B']);
    const [first, second] = transfer.legs.filter((l) => l.type === 'bus');
    assert.equal(first?.to.stopId, 'X');
    assert.equal(second?.from.stopId, 'X');
    // El segundo bus se toma al menos un minuto después de bajarse del primero.
    assert.ok(second!.departAt - first!.arriveAt >= 60_000 - 1);
    assertConsistent(transfer);
  });

  it('propone caminar cuando el destino está muy cerca', () => {
    const { journeys } = planner.plan(near(A2), { lat: A2[0] + 0.001, lng: A2[1] }, NOW);
    assert.ok(journeys[0]!.legs.every((l) => l.type === 'walk'));
  });

  it('explica cuando no hay cómo llegar', () => {
    const result = planner.plan(near(A1), { lat: 6.3, lng: -75.5 }, NOW);
    assert.equal(result.journeys.length, 0);
    assert.ok(result.notices.length > 0);
  });

  it('los tramos de bus traen el trazado para dibujarlos', () => {
    const { journeys } = planner.plan(near(A1), near(A2), NOW);
    const bus = journeys[0]!.legs.find((l) => l.type === 'bus')!;
    assert.ok(bus.path.length >= 2);
    assert.ok(Math.abs(bus.path[0]![1] - A1[1]) < 1e-4);
    assert.ok(Math.abs(bus.path.at(-1)![1] - A2[1]) < 1e-4);
  });
});

describe('GET /viajes (red real)', () => {
  it('planifica de Laureles al centro con varias rutas directas', async () => {
    const real = InMemoryNetworkStore.fromFile(config.networkFile);
    const app = await buildApp({ network: real, clock: () => NOW });
    try {
      const response = await app.inject({
        method: 'GET',
        url: '/viajes?origenLat=6.24597&origenLng=-75.59346&destinoLat=6.25002&destinoLng=-75.56814',
      });
      assert.equal(response.statusCode, 200);
      const body = response.json<{ journeys: Journey[] }>();
      assert.ok(body.journeys.length >= 2);
      assert.ok(
        body.journeys.every((j, i) => i === 0 || j.arriveAt >= body.journeys[i - 1]!.arriveAt)
      );
      const bad = await app.inject({ method: 'GET', url: '/viajes?origenLat=6.2&origenLng=-75.5' });
      assert.equal(bad.statusCode, 400);
    } finally {
      await app.close();
    }
  });
});
