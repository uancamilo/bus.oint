import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import Fastify, { type FastifyServerOptions } from 'fastify';

import { healthRoutes } from './http/health.ts';
import { routeRoutes } from './http/routes.ts';
import { stopRoutes } from './http/stops.ts';
import type { NetworkRepository } from './network/network-store.ts';

export interface AppOptions {
  network: NetworkRepository;
  logger?: FastifyServerOptions['logger'];
}

/** Construye la aplicación sin ponerla a escuchar (las pruebas usan `app.inject`). */
export async function buildApp({ network, logger = false }: AppOptions) {
  const app = Fastify({ logger }).withTypeProvider<TypeBoxTypeProvider>();

  // Prototipo en red local: se acepta cualquier origen (Expo web, Swagger, herramientas).
  await app.register(cors, { origin: true });

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
        { name: 'Rutas', description: 'Rutas de bus y sus trazados' },
        { name: 'Paradas', description: 'Paraderos físicos' },
        { name: 'Sistema', description: 'Estado del servidor' },
      ],
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  await app.register(healthRoutes, { network });
  await app.register(routeRoutes, { network });
  await app.register(stopRoutes, { network });

  return app;
}
