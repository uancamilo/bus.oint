import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';

import type { NetworkRepository } from '../network/network-store.ts';
import { HealthResponse } from './schemas.ts';

export const healthRoutes: FastifyPluginAsyncTypebox<{ network: NetworkRepository }> = async (
  app,
  { network }
) => {
  const startedAt = Date.now();
  app.get(
    '/health',
    {
      schema: {
        tags: ['Sistema'],
        summary: 'Estado del servidor y de la red cargada',
        response: { 200: HealthResponse },
      },
    },
    async () => ({
      status: 'ok' as const,
      uptimeS: Math.round((Date.now() - startedAt) / 1000),
      network: network.info,
    })
  );
};
