import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { NETWORK_FORMAT_VERSION, type NetworkData, type Route } from '../data/network-types.ts';
import { haversine } from '../geo/geometry.ts';
import { InMemoryNetworkStore } from '../network/network-store.ts';
import { BusSimulator } from './bus-simulator.ts';

// Ruta sintética: sube ~1,1 km hacia el norte (ida) y regresa por el mismo eje (vuelta).
const SOUTH: [number, number] = [6.2, -75.6];
const NORTH: [number, number] = [6.21, -75.6];
const LEG = haversine(...SOUTH, ...NORTH);
const LENGTH = Math.round(2 * LEG);

function makeRoute(overrides: Partial<Route> = {}): Route {
  return {
    id: 'R1',
    code: 'T1',
    name: 'Ruta de prueba',
    company: 'Pruebas',
    type: 'Circular',
    system: 'X',
    lengthM: LENGTH,
    path: [SOUTH, NORTH, SOUTH],
    segments: [
      { kind: 'service', direction: 'ida', startM: 0, endM: LENGTH / 2 },
      { kind: 'service', direction: 'vuelta', startM: LENGTH / 2, endM: LENGTH },
    ],
    stops: [
      { stopId: 'S1', direction: 'ida', seq: 1, atM: 500, offsetM: 0 },
      { stopId: 'S2', direction: 'vuelta', seq: 1, atM: 1600, offsetM: 0 },
    ],
    ...overrides,
  };
}

function makeSimulator(route: Route, spacingM = 500, speedKmh = 18) {
  const data: NetworkData = {
    version: NETWORK_FORMAT_VERSION,
    generatedAt: '2026-01-01T00:00:00.000Z',
    sources: {
      routes: { file: 'test', updatedAt: '2026-01-01' },
      stops: { file: 'test', updatedFrom: '2026-01-01', updatedTo: '2026-01-01' },
    },
    routes: [route],
    stops: [
      { id: 'S1', address: null, lat: 6.2045, lng: -75.6, routeIds: [route.id] },
      { id: 'S2', address: null, lat: 6.2056, lng: -75.6, routeIds: [route.id] },
    ],
    footpaths: [],
  };
  return new BusSimulator(new InMemoryNetworkStore(data), { spacingM, speedKmh }, () => 0);
}

const T0 = 1_800_000_000_000;
const forward = (from: number, to: number) => (((to - from) % LENGTH) + LENGTH) % LENGTH;

describe('BusSimulator', () => {
  it('reparte los buses a la misma distancia sobre el circuito', () => {
    const sim = makeSimulator(makeRoute(), 500);
    const buses = sim.busesOnRoute('R1', T0);
    assert.equal(buses.length, Math.round(LENGTH / 500));
    // El bus i+1 va una separación por delante del bus i.
    const gaps = buses.map((b, i) => forward(b.atM, buses[(i + 1) % buses.length]!.atM));
    for (const gap of gaps) assert.ok(Math.abs(gap - LENGTH / buses.length) <= 2, `hueco ${gap}`);
  });

  it('avanza a la velocidad configurada', () => {
    const sim = makeSimulator(makeRoute(), 500, 18); // 18 km/h = 5 m/s
    const before = sim.busesOnRoute('R1', T0)[0]!;
    const after = sim.busesOnRoute('R1', T0 + 10_000)[0]!;
    assert.ok(Math.abs(forward(before.atM, after.atM) - 50) <= 1);
  });

  it('es determinista: el mismo instante da la misma posición', () => {
    const a = makeSimulator(makeRoute()).busesOnRoute('R1', T0);
    const b = makeSimulator(makeRoute()).busesOnRoute('R1', T0);
    assert.deepEqual(a, b);
  });

  it('orienta el rumbo según el sentido y ubica el bus sobre el trazado', () => {
    const sim = makeSimulator(makeRoute(), 200);
    for (const bus of sim.busesOnRoute('R1', T0)) {
      assert.equal(bus.lng, -75.6);
      assert.ok(bus.lat >= SOUTH[0] - 1e-6 && bus.lat <= NORTH[0] + 1e-6);
      if (bus.direction === 'ida') assert.ok(bus.heading <= 1 || bus.heading >= 359);
      if (bus.direction === 'vuelta') assert.ok(Math.abs(bus.heading - 180) <= 1);
    }
  });

  it('calcula la próxima parada y su tiempo de llegada', () => {
    const sim = makeSimulator(makeRoute(), 500, 18);
    for (const bus of sim.busesOnRoute('R1', T0)) {
      assert.ok(bus.nextStop);
      const expected = bus.nextStop.id === 'S1' ? 500 : 1600;
      assert.ok(Math.abs(forward(bus.atM, expected) - bus.nextStop.distanceM) <= 1);
      assert.ok(Math.abs(bus.nextStop.etaS - bus.nextStop.distanceM / 5) <= 1);
    }
  });

  it('las llegadas a una parada salen de las posiciones de los buses', () => {
    const sim = makeSimulator(makeRoute(), 500, 18);
    const headwayS = LENGTH / sim.busesOnRoute('R1', T0).length / 5;
    const arrivals = sim.arrivalsAt('R1', 500, 3, T0);
    assert.equal(arrivals.length, 3);
    assert.ok(arrivals[0]!.etaS <= headwayS + 1);
    assert.ok(arrivals.every((a, i) => i === 0 || a.etaS > arrivals[i - 1]!.etaS));
    // Diez segundos después, el primer bus está diez segundos más cerca (si no ha pasado).
    const later = sim.arrivalsAt('R1', 500, 1, T0 + 10_000)[0]!;
    if (arrivals[0]!.etaS > 10) assert.ok(Math.abs(later.etaS - (arrivals[0]!.etaS - 10)) <= 1);
  });

  it('agrupa las llegadas de una parada física por ruta y sentido', () => {
    const sim = makeSimulator(makeRoute());
    const [entry] = sim.stopArrivals('S2', 2, T0);
    assert.equal(entry?.routeId, 'R1');
    assert.equal(entry?.direction, 'vuelta');
    assert.equal(entry?.arrivals.length, 2);
  });

  it('oculta los buses en tramos hacia la terminal', () => {
    const route = makeRoute({
      segments: [
        { kind: 'service', direction: 'ida', startM: 0, endM: LENGTH / 2 },
        { kind: 'deadhead', startM: LENGTH / 2, endM: LENGTH },
      ],
    });
    const buses = makeSimulator(route, 100).busesOnRoute('R1', T0);
    const hidden = buses.filter((b) => !b.visible);
    assert.ok(hidden.length > 0);
    assert.ok(hidden.every((b) => b.atM >= LENGTH / 2 - 1 && b.direction === null));
  });

  it('una ruta corta tiene al menos un bus', () => {
    assert.equal(makeSimulator(makeRoute(), 50_000).busesOnRoute('R1', T0).length, 1);
  });
});
