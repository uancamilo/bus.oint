import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';

import type { RealtimeHub } from '../realtime/realtime-hub.ts';

/** WebSocket `/tiempo-real`: posiciones de los buses de las rutas suscritas. */
export const realtimeRoutes: FastifyPluginAsyncTypebox<{ hub: RealtimeHub }> = async (
  app,
  { hub }
) => {
  app.get(
    '/tiempo-real',
    {
      websocket: true,
      schema: {
        tags: ['Tiempo real'],
        summary: 'WebSocket con las posiciones de los buses',
        description: [
          'Conéctate con `ws://<servidor>/tiempo-real` y envía:',
          '`{"type":"subscribe","routeIds":["90282"]}` (máximo 20 rutas; reemplaza la suscripción).',
          'Respuestas: `welcome`, `subscribed`, y cada segundo `buses` con',
          '`{"at": epochMs, "routes": {"90282": [Bus]}}`. Un bus con `visible: false` va hacia',
          'la terminal y no debe dibujarse. Errores: `{"type":"error","message":"..."}`.',
        ].join(' '),
      },
    },
    (socket) => hub.connect(socket)
  );
};
