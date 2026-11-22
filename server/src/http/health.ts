import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';

import type { NetworkRepository } from '../network/network-store.ts';
import type { RealtimeHub } from '../realtime/realtime-hub.ts';
import type { BusSimulator } from '../simulation/bus-simulator.ts';
import { HealthResponse } from './schemas.ts';

export const healthRoutes: FastifyPluginAsyncTypebox<{
  network: NetworkRepository;
  simulator: BusSimulator;
  hub: RealtimeHub;
}> = async (app, { network, simulator, hub }) => {
  const startedAt = Date.now();
  app.get(
    '/health',
    {
      schema: {
        tags: ['Sistema'],
        summary: 'Estado del servidor, la red cargada y la simulación',
        response: { 200: HealthResponse },
      },
    },
    async () => ({
      status: 'ok' as const,
      uptimeS: Math.round((Date.now() - startedAt) / 1000),
      network: network.info,
      simulation: {
        buses: simulator.totalBuses,
        spacingM: simulator.config.spacingM,
        speedKmh: simulator.config.speedKmh,
        realtimeClients: hub.clientCount,
      },
    })
  );
};
