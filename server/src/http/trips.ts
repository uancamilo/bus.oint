import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';

import type { TripPlanner } from '../planner/trip-planner.ts';
import { Latitude, Longitude } from './schemas.ts';

const LegPlace = Type.Object({
  name: Type.String(),
  lat: Type.Number(),
  lng: Type.Number(),
  stopId: Type.Optional(Type.String()),
});

const LegCommon = {
  from: LegPlace,
  to: LegPlace,
  departAt: Type.Integer({ description: 'epoch ms' }),
  arriveAt: Type.Integer({ description: 'epoch ms' }),
  durationS: Type.Integer(),
  distanceM: Type.Integer(),
  path: Type.Array(Type.Tuple([Type.Number(), Type.Number()]), {
    description: 'Polilínea [lat, lng] del tramo',
  }),
};

const WalkLeg = Type.Object({ type: Type.Literal('walk'), ...LegCommon });

const BusLeg = Type.Object({
  type: Type.Literal('bus'),
  ...LegCommon,
  route: Type.Object({ id: Type.String(), code: Type.String(), name: Type.String() }),
  direction: Type.Union([Type.Literal('ida'), Type.Literal('vuelta')]),
  busId: Type.String({ description: 'Bus simulado que conviene tomar' }),
  waitS: Type.Integer({ description: 'Espera en la parada antes de subir' }),
  stopCount: Type.Integer({ description: 'Paradas que recorre' }),
});

const Journey = Type.Object(
  {
    departAt: Type.Integer(),
    arriveAt: Type.Integer(),
    durationS: Type.Integer(),
    transfers: Type.Integer(),
    walkM: Type.Integer(),
    waitS: Type.Integer(),
    routeCodes: Type.Array(Type.String()),
    legs: Type.Array(Type.Union([WalkLeg, BusLeg])),
  },
  { $id: 'Journey' }
);

const PlanResponse = Type.Object({
  at: Type.Integer({ description: 'Instante de la simulación usado para planificar (epoch ms)' }),
  journeys: Type.Array(Journey, {
    description: 'Ordenados por hora de llegada, luego menos transbordos, luego menos caminata',
  }),
  notices: Type.Array(Type.String()),
});

export const tripRoutes: FastifyPluginAsyncTypebox<{ planner: TripPlanner }> = async (
  app,
  { planner }
) => {
  app.get(
    '/viajes',
    {
      schema: {
        tags: ['Viajes'],
        summary: 'Cómo llegar en bus de un punto a otro (hasta 2 transbordos)',
        description:
          'Planifica con el algoritmo RAPTOR sobre la red oficial. Las esperas se calculan con ' +
          'las posiciones actuales de los buses simulados. Devuelve varias opciones: una por ' +
          'cada ruta directa que sirve, opciones con transbordo cuando llegan claramente antes, ' +
          'y la opción de caminar si el destino está cerca.',
        querystring: Type.Object({
          origenLat: Latitude,
          origenLng: Longitude,
          destinoLat: Latitude,
          destinoLng: Longitude,
          origenNombre: Type.Optional(Type.String({ maxLength: 120 })),
          destinoNombre: Type.Optional(Type.String({ maxLength: 120 })),
        }),
        response: { 200: PlanResponse },
      },
    },
    async (request) => {
      const q = request.query;
      return planner.plan(
        { lat: q.origenLat, lng: q.origenLng, name: q.origenNombre },
        { lat: q.destinoLat, lng: q.destinoLng, name: q.destinoNombre }
      );
    }
  );
};
