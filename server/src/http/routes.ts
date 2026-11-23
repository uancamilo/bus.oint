import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';

import type { NetworkRepository } from '../network/network-store.ts';
import type { BusSimulator } from '../simulation/bus-simulator.ts';
import { ErrorResponse, RouteBuses, RouteDetail, RouteSummary } from './schemas.ts';

export const routeRoutes: FastifyPluginAsyncTypebox<{
  network: NetworkRepository;
  simulator: BusSimulator;
}> = async (app, { network, simulator }) => {
  app.get(
    '/rutas/:id/buses',
    {
      schema: {
        tags: ['Rutas'],
        summary: 'Posición actual de los buses simulados de una ruta',
        description:
          'Foto instantánea. Para recibir posiciones cada segundo, usa el WebSocket /tiempo-real.',
        params: Type.Object({ id: Type.String({ examples: ['90282'] }) }),
        response: { 200: RouteBuses, 404: ErrorResponse },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      if (!simulator.hasRoute(id)) {
        return reply.code(404).send({ error: 'not_found', message: `No existe la ruta ${id}` });
      }
      const at = simulator.now();
      return { routeId: id, at, buses: simulator.busesOnRoute(id, at) };
    }
  );

  app.get(
    '/rutas',
    {
      schema: {
        tags: ['Rutas'],
        summary: 'Lista y busca rutas',
        description:
          'Sin `q` devuelve todas las rutas ordenadas por código. Con `q` busca por código, ' +
          'nombre o empresa (sin importar tildes ni mayúsculas); primero las coincidencias ' +
          'exactas de código.',
        querystring: Type.Object({
          q: Type.Optional(Type.String({ maxLength: 80, examples: ['304', 'laureles'] })),
          tipo: Type.Optional(
            Type.String({ examples: ['Directa Centro', 'Integrada', 'Circular'] })
          ),
          limite: Type.Integer({ minimum: 1, maximum: 300, default: 300 }),
        }),
        response: { 200: Type.Array(RouteSummary) },
      },
    },
    async (request) =>
      network.searchRoutes({
        query: request.query.q,
        type: request.query.tipo,
        limit: request.query.limite,
      })
  );

  app.get(
    '/rutas/:id',
    {
      schema: {
        tags: ['Rutas'],
        summary: 'Detalle de una ruta: trazado, tramos y paradas',
        params: Type.Object({ id: Type.String({ examples: ['90012'] }) }),
        response: { 200: RouteDetail, 404: ErrorResponse },
      },
    },
    async (request, reply) => {
      const route = network.getRoute(request.params.id);
      if (!route) {
        return reply
          .code(404)
          .send({ error: 'not_found', message: `No existe la ruta ${request.params.id}` });
      }
      return {
        ...network.routeSummary(route),
        bounds: network.routeBounds(route),
        path: route.path,
        segments: route.segments,
        stops: route.stops.map((routeStop) => {
          const stop = network.getStop(routeStop.stopId)!;
          return {
            id: routeStop.stopId,
            direction: routeStop.direction,
            seq: routeStop.seq,
            atM: routeStop.atM,
            address: stop.address,
            lat: stop.lat,
            lng: stop.lng,
          };
        }),
      };
    }
  );
};
