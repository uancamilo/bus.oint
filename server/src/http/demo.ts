import { readFile } from 'node:fs/promises';

import type { FastifyPluginAsync } from 'fastify';

/**
 * Página de demostración en /demo: mapa (Leaflet + OpenStreetMap) con buscador de destinos y
 * de rutas, trazados, paradas con próximas llegadas y buses moviéndose en vivo por WebSocket.
 * Sirve para probar el backend sin la app y como respaldo en la presentación.
 */
const DEMO_FILE = new URL('../../public/demo.html', import.meta.url);

export const demoRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { schema: { hide: true } }, async (_request, reply) => reply.redirect('/demo'));
  // Se lee en cada visita (pesa unos KB) para que los cambios se vean sin reiniciar.
  app.get('/demo', { schema: { hide: true } }, async (_request, reply) =>
    reply.type('text/html; charset=utf-8').send(await readFile(DEMO_FILE, 'utf8'))
  );
};
