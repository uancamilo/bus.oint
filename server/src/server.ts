import { networkInterfaces } from 'node:os';

import { buildApp } from './app.ts';
import { config } from './config.ts';
import { InMemoryNetworkStore } from './network/network-store.ts';
import { SqliteGeocodeCache } from './places/geocode-cache.ts';
import { NominatimClient } from './places/nominatim.ts';
import { PlaceSearchService } from './places/place-search.ts';

const network = InMemoryNetworkStore.fromFile(config.networkFile);
const geocodeCache = new SqliteGeocodeCache(config.dbFile);
const places = new PlaceSearchService(
  PlaceSearchService.loadKnownPlaces(config.placesFile),
  network,
  geocodeCache,
  config.nominatimEnabled ? new NominatimClient() : null
);
const app = await buildApp({
  network,
  places,
  simulation: config.simulation,
  tickMs: config.tickMs,
  logger: { level: config.logLevel },
});

await app.listen({ host: config.host, port: config.port });

/** Direcciones IPv4 de la red local, para abrir el backend desde el celular. */
function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((iface) => iface?.family === 'IPv4' && !iface.internal)
    .map((iface) => iface!.address);
}

const urls = [
  `http://localhost:${config.port}`,
  ...lanAddresses().map((ip) => `http://${ip}:${config.port}`),
];
console.log(
  [
    '',
    `bus.point API lista: ${network.info.routes} rutas, ${network.info.stops} paradas`,
    `Simulación: un bus cada ${config.simulation.spacingM} m a ${config.simulation.speedKmh} km/h`,
    `Lugares: ${places.knownPlaceCount} conocidos · OpenStreetMap ${config.nominatimEnabled ? 'activado' : 'desactivado'}`,
    ...urls.map((url) => `  ${url}/demo  (mapa)  ·  ${url}/docs  (API)`),
    `WebSocket: ws://<servidor>:${config.port}/tiempo-real`,
    '',
  ].join('\n')
);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close().then(() => {
      geocodeCache.close();
      process.exit(0);
    });
  });
}
