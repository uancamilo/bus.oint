import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyServerOptions } from 'fastify';

import { demoRoutes } from './http/demo.ts';
import { healthRoutes } from './http/health.ts';
import { placeRoutes } from './http/places.ts';
import { realtimeRoutes } from './http/realtime.ts';
import { routeRoutes } from './http/routes.ts';
import { stopRoutes } from './http/stops.ts';
import { tripRoutes } from './http/trips.ts';
import type { NetworkRepository } from './network/network-store.ts';
import { SqliteGeocodeCache } from './places/geocode-cache.ts';
import { PlaceSearchService } from './places/place-search.ts';
import { DEFAULT_PLANNER, TripPlanner, type PlannerConfig } from './planner/trip-planner.ts';
import { RealtimeHub } from './realtime/realtime-hub.ts';
import { BusSimulator, type Clock, type SimulationConfig } from './simulation/bus-simulator.ts';

export interface AppOptions {
  network: NetworkRepository;
  simulation?: SimulationConfig;
  /** Intervalo de envío por WebSocket (ms). */
  tickMs?: number;
  /** Reloj de la simulación; las pruebas lo fijan para obtener resultados deterministas. */
  clock?: Clock;
  /** Buscador de destinos; por defecto solo local, sin lugares conocidos ni internet. */
  places?: PlaceSearchService;
  planner?: Partial<PlannerConfig>;
  logger?: FastifyServerOptions['logger'];
}

export const DEFAULT_SIMULATION: SimulationConfig = { spacingM: 2000, speedKmh: 18 };

/** Construye la aplicación sin ponerla a escuchar (las pruebas usan `app.inject`). */
export async function buildApp({
  network,
  simulation = DEFAULT_SIMULATION,
  tickMs = 1000,
  clock,
  places,
  planner: plannerConfig,
  logger = false,
}: AppOptions) {
  const app = Fastify({ logger }).withTypeProvider<TypeBoxTypeProvider>();
  const simulator = new BusSimulator(network, simulation, clock);
  const hub = new RealtimeHub(simulator, tickMs);
  app.addHook('onClose', async () => hub.close());
  const planner = new TripPlanner(network, simulator, { ...DEFAULT_PLANNER, ...plannerConfig });
  const placeSearch =
    places ?? new PlaceSearchService([], network, new SqliteGeocodeCache(':memory:'), null);

  // Prototipo en red local: se acepta cualquier origen (Expo web, Swagger, herramientas).
  await app.register(cors, { origin: true });
  await app.register(websocket);

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'bus.point API',
        version: '0.1.0',
        description:
          'Backend del prototipo bus.point: rutas y paradas oficiales de bus de Medellín ' +
          '(Datos Abiertos de la Alcaldía), simulación de buses en tiempo real y planificador ' +
          'de viajes.',
      },
      tags: [
        { name: 'Rutas', description: 'Rutas de bus, sus trazados y sus buses' },
        { name: 'Paradas', description: 'Paraderos físicos y próximas llegadas' },
        { name: 'Viajes', description: 'Planificador de viajes en bus' },
        { name: 'Lugares', description: 'Búsqueda de destinos y direcciones' },
        { name: 'Tiempo real', description: 'WebSocket con posiciones de buses' },
        { name: 'Sistema', description: 'Estado del servidor' },
      ],
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  await app.register(healthRoutes, { network, simulator, hub });
  await app.register(routeRoutes, { network, simulator });
  await app.register(stopRoutes, { network, simulator });
  await app.register(tripRoutes, { planner });
  await app.register(placeRoutes, { places: placeSearch });
  await app.register(realtimeRoutes, { hub });
  await app.register(demoRoutes);

  return app;
}
