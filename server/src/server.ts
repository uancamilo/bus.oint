import { networkInterfaces } from 'node:os';

import { buildApp } from './app.ts';
import { config } from './config.ts';
import { InMemoryNetworkStore } from './network/network-store.ts';

const network = InMemoryNetworkStore.fromFile(config.networkFile);
const app = await buildApp({ network, logger: { level: config.logLevel } });

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
    ...urls.map((url) => `  ${url}  (docs: ${url}/docs)`),
    '',
  ].join('\n')
);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}
