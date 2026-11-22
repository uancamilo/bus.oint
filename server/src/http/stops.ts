import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';

import type { Stop } from '../data/network-types.ts';
import type { NetworkRepository } from '../network/network-store.ts';
import type { BusSimulator } from '../simulation/bus-simulator.ts';
import {
  ErrorResponse,
  Latitude,
  Longitude,
  NearbyStop,
  StopArrivals,
  StopDetail,
} from './schemas.ts';

export const stopRoutes: FastifyPluginAsyncTypebox<{
  network: NetworkRepository;
  simulator: BusSimulator;
}> = async (app, { network, simulator }) => {
  app.get(
    '/paradas/:id/llegadas',
    {
      schema: {
        tags: ['Paradas'],
        summary: 'Próximos buses que llegarán a una parada, por ruta',
        description:
          'Tiempos calculados con las posiciones de la simulación: distancia por la ruta del ' +
          'bus más cercano que viene, dividida por la velocidad.',
        params: Type.Object({ id: Type.String({ examples: ['52588'] }) }),
        querystring: Type.Object({
          proximos: Type.Integer({
            minimum: 1,
            maximum: 5,
            default: 3,
            description: 'Cuántos buses por ruta',
          }),
        }),
        response: { 200: StopArrivals, 404: ErrorResponse },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      if (!network.getStop(id)) {
        return reply.code(404).send({ error: 'not_found', message: `No existe la parada ${id}` });
      }
      const at = simulator.now();
      return {
        stopId: id,
        at,
        routes: simulator.stopArrivals(id, request.query.proximos, at).flatMap((entry) => {
          const route = network.getRoute(entry.routeId);
          if (!route) return [];
          return [
            {
              route: { id: route.id, code: route.code, name: route.name },
              direction: entry.direction,
              seq: entry.seq,
              arrivals: entry.arrivals,
            },
          ];
        }),
      };
    }
  );

  const withRoutes = (stop: Stop) => ({
    id: stop.id,
    address: stop.address,
    lat: stop.lat,
    lng: stop.lng,
    routes: stop.routeIds.flatMap((id) => {
      const route = network.getRoute(id);
      return route ? [{ id: route.id, code: route.code, name: route.name }] : [];
    }),
  });

  app.get(
    '/paradas/cercanas',
    {
      schema: {
        tags: ['Paradas'],
        summary: 'Paradas cercanas a un punto, de la más cercana a la más lejana',
        querystring: Type.Object({
          lat: Latitude,
          lng: Longitude,
          radio: Type.Integer({
            minimum: 50,
            maximum: 2000,
            default: 500,
            description: 'Radio de búsqueda en metros',
          }),
          limite: Type.Integer({ minimum: 1, maximum: 100, default: 20 }),
        }),
        response: { 200: Type.Array(NearbyStop) },
      },
    },
    async (request) => {
      const { lat, lng, radio, limite } = request.query;
      return network
        .nearbyStops(lat, lng, radio, limite)
        .map((stop) => ({ ...withRoutes(stop), distanceM: stop.distanceM }));
    }
  );

  app.get(
    '/paradas/:id',
    {
      schema: {
        tags: ['Paradas'],
        summary: 'Detalle de una parada y las rutas que la atienden',
        params: Type.Object({ id: Type.String({ examples: ['52588'] }) }),
        response: { 200: StopDetail, 404: ErrorResponse },
      },
    },
    async (request, reply) => {
      const stop = network.getStop(request.params.id);
      if (!stop) {
        return reply
          .code(404)
          .send({ error: 'not_found', message: `No existe la parada ${request.params.id}` });
      }
      return withRoutes(stop);
    }
  );
};
