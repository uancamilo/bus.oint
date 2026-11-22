# bus.point · backend

Backend del prototipo **bus.point**. Usa las rutas y paradas oficiales de bus de Medellín, simula buses que se mueven en tiempo real, busca destinos y planifica viajes con hasta 2 transbordos.

Todo corre en un solo computador. Los celulares de la demo se conectan por la red Wi-Fi.

## Inicio rápido

Requisitos: **Node.js 22 o superior** (probado con Node 24) y npm.

```bash
cd server
npm install
npm run dev
```

La primera vez, `npm run dev` genera la red a partir de los GeoJSON oficiales (unos 2 segundos). Al arrancar, la terminal muestra las direcciones:

```
bus.point API lista: 239 rutas, 3544 paradas
Simulación: un bus cada 2000 m a 18 km/h
Lugares: 74 conocidos · OpenStreetMap activado
  http://localhost:3000/demo  (mapa)  ·  http://localhost:3000/docs  (API)
  http://192.168.x.x:3000/demo  (mapa)  ·  http://192.168.x.x:3000/docs  (API)
```

| Dirección                   | Para qué                                                                   |
| --------------------------- | -------------------------------------------------------------------------- |
| `/demo`                     | Mapa de prueba: buscar destinos, planificar viajes y ver los buses en vivo |
| `/docs`                     | Documentación interactiva de la API (Swagger), con "Try it out"            |
| `http://192.168.x.x:3000/…` | Lo mismo desde un **celular en la misma Wi-Fi**                            |

## Guion para la presentación

1. Abre `http://<ip>:3000/demo` en el celular y en el proyector.
2. **Rutas en vivo:** busca "190", agrégala y muestra sus buses moviéndose; toca una parada para ver en cuántos minutos llega cada ruta.
3. **Cómo llegar:** en "Desde" escribe "udea"; en "¿A dónde vas?", "unicentro". Aparecen las opciones con duración, transbordos y metros a pie; al elegir una se dibuja el viaje y el bus a tomar aparece resaltado.
4. **Direcciones:** escribe "carrera 70 con calle 44" para mostrar que entiende direcciones de Medellín. Escribe un lugar que no esté en la lista, por ejemplo "Museo El Castillo", y pulsa Enter: el resultado llega desde OpenStreetMap.
5. **API:** abre `/docs` para mostrar los endpoints, y explica la arquitectura (sección siguiente).

Ensaya las búsquedas externas antes de la presentación: quedan guardadas en caché y funcionan aunque falle el internet ese día. El fondo del mapa sí necesita internet, porque viene de los servidores de OpenStreetMap.

## Arquitectura

```
 data/*.geojson (Datos Abiertos Medellín, EPSG:9377)
        │  npm run data:build: convierte coordenadas, orienta trazados, arma circuitos,
        ▼  ubica paradas y calcula conexiones a pie
 data/processed/network.json
        │
        ▼
 ┌───────────────────────── server (Node.js + TypeScript + Fastify) ─────────────────────────┐
 │                                                                                            │
 │  network/      NetworkRepository → InMemoryNetworkStore (rutas, paradas, índice espacial)  │
 │  simulation/   BusSimulator: posición de cada bus = f(hora), llegadas a cada parada        │
 │  planner/      TripPlanner: RAPTOR con hasta 2 transbordos, esperas tomadas del simulador  │
 │  places/       PlaceSearchService: lugares + direcciones → Nominatim (caché en SQLite)     │
 │  realtime/     RealtimeHub: WebSocket, envía solo las rutas suscritas                      │
 │  http/         Endpoints REST con validación TypeBox y Swagger                             │
 └────────────────────────────────────────────────────────────────────────────────────────────┘
        ▲ HTTP / WebSocket (red Wi-Fi local)
        │
   App Expo (celular) · mapa de prueba /demo
```

Cada capa depende de una interfaz y no de una tecnología concreta, así que el prototipo se puede escalar sin reescribirlo. Esta tabla compara el prototipo con la arquitectura de referencia del curso (`arquitectura-cine.html`):

| Pieza                       | Prototipo                             | En producción                        |
| --------------------------- | ------------------------------------- | ------------------------------------ |
| Datos de red                | Memoria (`InMemoryNetworkStore`)      | PostgreSQL + PostGIS                 |
| Estado en vivo de los buses | Función de la hora (`BusSimulator`)   | GPS de los buses → Redis             |
| Caché de búsquedas          | SQLite (`SqliteGeocodeCache`)         | Redis                                |
| Tiempo real                 | WebSocket de Fastify                  | API Gateway WebSocket / Cloud Run WS |
| Entrada única               | Fastify (validación de cada petición) | API Gateway + WAF + rate limiting    |
| Catálogo de rutas           | `GET /rutas`                          | Cacheado en CDN (casi nunca cambia)  |

### Simulación

Cada ruta es un circuito cerrado (ida + vuelta) por el que dan vueltas N buses, separados la misma distancia y a velocidad constante:

```
posición(t) = (desfase + i · separación + velocidad · t) mod longitud
```

No hay estado que se desincronice: dos consultas en el mismo instante dan la misma respuesta, y al reiniciar el servidor los buses siguen donde iban. La espera en una parada es la distancia del bus más cercano que viene, dividida por la velocidad.

### Planificador

Usa RAPTOR (Delling, Pajor y Werneck, _Round-Based Public Transit Routing_, 2012), que trabaja por rondas: ronda 1 = bus directo, ronda 2 = un transbordo, ronda 3 = dos.

- Para cada ruta que sirve directamente al usuario, ofrece su mejor opción.
- Un viaje con más transbordos solo aparece si llega al menos 3 minutos antes.
- Si el destino está cerca, también propone caminar.
- Resuelve cada consulta en 15 a 50 ms.

## API

| Método | Ruta                                                    | Descripción                                                         |
| ------ | ------------------------------------------------------- | ------------------------------------------------------------------- |
| GET    | `/rutas?q=&tipo=&limite=`                               | Lista o busca rutas (código, nombre o empresa, sin importar tildes) |
| GET    | `/rutas/:id`                                            | Trazado del circuito, tramos, paradas en orden y límites del mapa   |
| GET    | `/rutas/:id/buses`                                      | Posición actual de los buses de la ruta                             |
| GET    | `/paradas/cercanas?lat=&lng=&radio=`                    | Paradas cercanas a un punto, con sus rutas                          |
| GET    | `/paradas/:id`                                          | Detalle de una parada                                               |
| GET    | `/paradas/:id/llegadas?proximos=`                       | Próximos buses de cada ruta que pasa por la parada                  |
| GET    | `/lugares?q=&externo=`                                  | Busca un destino: local (autocompletar) o también en OpenStreetMap  |
| GET    | `/viajes?origenLat=&origenLng=&destinoLat=&destinoLng=` | Opciones de viaje en bus                                            |
| GET    | `/health`                                               | Estado del servidor, la red y la simulación                         |
| WS     | `/tiempo-real`                                          | Posiciones de los buses cada segundo                                |

Los detalles de cada campo están en `/docs`.

### WebSocket `/tiempo-real`

```jsonc
// cliente → servidor (reemplaza la suscripción; máximo 20 rutas)
{ "type": "subscribe", "routeIds": ["90282", "90283"] }

// servidor → cliente
{ "type": "welcome", "tickMs": 1000, "maxRoutes": 20 }
{ "type": "subscribed", "routeIds": ["90282", "90283"], "unknownRouteIds": [] }
{ "type": "buses", "at": 1732300000000, "routes": { "90282": [ /* Bus */ ] } }
{ "type": "error", "message": "..." }
```

Un `Bus` trae `id`, `lat`, `lng`, `heading` (rumbo), `direction` (ida/vuelta), `visible` y `nextStop` (`id`, `distanceM`, `etaS`). Un bus con `visible: false` va hacia la terminal y no debe dibujarse.

## Scripts

| Comando                | Qué hace                                                                                            |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| `npm run dev`          | Servidor que se reinicia al cambiar el código                                                       |
| `npm start`            | Servidor sin recarga                                                                                |
| `npm test`             | 49 pruebas con `node:test` (sin internet: Nominatim se simula)                                      |
| `npm run typecheck`    | Verificación de tipos                                                                               |
| `npm run data:build`   | Regenera `data/processed/network.json` e imprime un reporte de calidad                              |
| `npm run places:build` | Obtiene de OpenStreetMap las coordenadas de los lugares nuevos de `data/places/lugares-fuente.json` |

`dev`, `start` y `test` generan la red automáticamente si falta o si cambiaron los GeoJSON. El lint y el formato se ejecutan desde la raíz del repositorio: `npx eslint server/src server/scripts` y `npx prettier --check "server/**/*.ts"`.

## Configuración

Por variables de entorno, todas opcionales:

| Variable            | Por defecto                   | Descripción                                               |
| ------------------- | ----------------------------- | --------------------------------------------------------- |
| `PORT`              | `3000`                        | Puerto                                                    |
| `HOST`              | `0.0.0.0`                     | Interfaz; `0.0.0.0` permite que los celulares se conecten |
| `BUS_SPACING_M`     | `2000`                        | Distancia entre buses de una ruta (m)                     |
| `BUS_SPEED_KMH`     | `18`                          | Velocidad de los buses                                    |
| `TICK_MS`           | `1000`                        | Frecuencia de envío por WebSocket                         |
| `MAX_WALK_M`        | `500`                         | Distancia máxima a pie hasta una parada                   |
| `NOMINATIM_ENABLED` | `true`                        | `false` = sin búsquedas en OpenStreetMap                  |
| `DB_FILE`           | `server/var/bus-point.sqlite` | Base SQLite (caché)                                       |
| `LOG_LEVEL`         | `info`                        | Nivel de los registros                                    |

Ejemplo: `BUS_SPEED_KMH=30 npm run dev`.

## Datos y licencias

- **Rutas y paradas:** portal de Datos Abiertos de la Alcaldía de Medellín. El detalle y el procesamiento están en [`data/README.md`](../data/README.md); falta registrar allí la URL y la licencia.
- **Lugares, búsquedas externas y fondo del mapa:** © OpenStreetMap contributors, licencia ODbL. La atribución aparece en el mapa y en las respuestas de `/lugares`.

## Limitaciones conocidas

- **Los buses son simulados:** misma velocidad, sin tráfico ni horarios reales. En producción, el simulador se reemplaza por el GPS de los buses, sin cambiar la API.
- **13 rutas excluidas** por trazados oficiales con errores de digitalización, entre ellas varias rutas 98 a Santa Elena y la 305. **5 rutas sin paradas** aparecen en el mapa, pero no en el planificador.
- **El Metro no está integrado:** el planificador solo combina buses.
- A veces la opción más rápida incluye un tramo de bus muy corto antes de transbordar, porque se optimiza la hora de llegada.
- **Lugares que faltan:** la Estación Sabaneta y el Parque Lleras no se encontraron en OpenStreetMap con esos nombres.
- **Códigos repetidos:** 19 códigos de ruta se usan en rutas distintas (por ejemplo, la 243 es "La Divisa" y "La Quiebra"), así que hay que mostrar siempre el código con el nombre.

## Solución de problemas

| Síntoma                                   | Causa probable                                                                                                                                                                                             |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| El mapa dice "sin conexión al servidor"   | El servidor está apagado o el computador cambió de red: vuelve a abrir la dirección que muestra la terminal                                                                                                |
| El celular no abre la página              | Celular y computador en redes distintas, o el firewall bloquea el puerto 3000 (en Linux: `sudo ufw allow 3000/tcp`). Algunas redes de universidad aíslan los dispositivos: usa la zona Wi-Fi de un celular |
| `EADDRINUSE` al arrancar                  | El puerto ya está en uso: cierra el otro servidor o usa `PORT=3001 npm run dev`                                                                                                                            |
| La búsqueda externa responde con un error | Sin internet, o Nominatim limitó las consultas: se siguen mostrando los resultados locales                                                                                                                 |
