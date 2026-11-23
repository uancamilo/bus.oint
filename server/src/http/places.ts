import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';

import type { PlaceSearchService } from '../places/place-search.ts';

const PlaceResult = Type.Object(
  {
    id: Type.String({ examples: ['lugar:u-eafit', 'parada:52588', 'osm:way/123'] }),
    name: Type.String(),
    detail: Type.String({ description: 'Categoría, "Paradero de bus" o descripción de OSM' }),
    lat: Type.Number(),
    lng: Type.Number(),
    source: Type.Union([Type.Literal('lugar'), Type.Literal('parada'), Type.Literal('osm')], {
      description: 'lugar: lista curada · parada: dirección de un paradero · osm: OpenStreetMap',
    }),
  },
  { $id: 'PlaceResult' }
);

const PlaceSearchResponse = Type.Object({
  results: Type.Array(PlaceResult),
  external: Type.Object({
    used: Type.Boolean({ description: 'Se usó OpenStreetMap (en vivo o desde la caché)' }),
    cached: Type.Boolean(),
    error: Type.Optional(Type.String()),
  }),
  attribution: Type.Optional(Type.String()),
});

export const placeRoutes: FastifyPluginAsyncTypebox<{ places: PlaceSearchService }> = async (
  app,
  { places }
) => {
  app.get(
    '/lugares',
    {
      schema: {
        tags: ['Lugares'],
        summary: 'Busca un destino: lugar conocido, dirección o sitio de OpenStreetMap',
        description:
          'Con `externo=false` (por defecto) solo busca en los datos locales: lugares conocidos ' +
          'y direcciones de paraderos ("carrera 70 con calle 44"). Es instantáneo y sirve para ' +
          'autocompletar. Con `externo=true` (al pulsar "Buscar"), si no hay una coincidencia ' +
          'exacta, consulta también OpenStreetMap (Nominatim) y guarda el resultado en caché.',
        querystring: Type.Object({
          q: Type.String({ minLength: 1, maxLength: 120, examples: ['eafit', 'cr 70 cl 44'] }),
          externo: Type.Boolean({ default: false }),
          limite: Type.Integer({ minimum: 1, maximum: 20, default: 8 }),
        }),
        response: { 200: PlaceSearchResponse },
      },
    },
    async (request) =>
      places.search(request.query.q, {
        external: request.query.externo,
        limit: request.query.limite,
      })
  );
};
