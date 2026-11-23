/**
 * Esquemas TypeBox de la API. Validan la entrada, aceleran la serialización de las
 * respuestas y alimentan la documentación Swagger en /docs.
 */
import { Type } from 'typebox';

export const ErrorResponse = Type.Object(
  {
    error: Type.String({ description: 'Código del error', examples: ['not_found'] }),
    message: Type.String(),
  },
  { $id: 'ErrorResponse' }
);

const Direction = Type.Union([Type.Literal('ida'), Type.Literal('vuelta')], {
  description: 'ida = Origen-Destino, vuelta = Destino-Origen',
});

export const RouteSummary = Type.Object(
  {
    id: Type.String({ description: 'id_ruta oficial', examples: ['90012'] }),
    code: Type.String({ description: 'Código visible en el bus', examples: ['304'] }),
    name: Type.String({ examples: ['Comercial Hotelera derecha'] }),
    company: Type.String(),
    type: Type.String({ description: 'Directa Centro, Integrada, Circular o Directa No Centro' }),
    system: Type.String(),
    lengthM: Type.Integer({ description: 'Longitud del circuito ida + vuelta, en metros' }),
    stopCount: Type.Integer(),
    plannable: Type.Boolean({ description: 'false si la ruta no tiene paradas oficiales' }),
  },
  { $id: 'RouteSummary' }
);

const Bounds = Type.Object({
  north: Type.Number(),
  south: Type.Number(),
  east: Type.Number(),
  west: Type.Number(),
});

const CircuitSegment = Type.Object({
  kind: Type.Union([Type.Literal('service'), Type.Literal('connector'), Type.Literal('deadhead')], {
    description:
      'service: atiende paradas; connector: hueco corto visible; deadhead: tramo a terminal (bus oculto)',
  }),
  direction: Type.Optional(Direction),
  startM: Type.Number(),
  endM: Type.Number(),
});

export const RouteDetail = Type.Object(
  {
    ...RouteSummary.properties,
    bounds: Bounds,
    path: Type.Array(Type.Tuple([Type.Number(), Type.Number()]), {
      description: 'Circuito cerrado como pares [latitud, longitud]',
    }),
    segments: Type.Array(CircuitSegment),
    stops: Type.Array(
      Type.Object({
        id: Type.String(),
        direction: Direction,
        seq: Type.Integer({ description: 'Orden oficial dentro del sentido' }),
        atM: Type.Number({ description: 'Posición sobre el circuito, en metros' }),
        address: Type.Union([Type.String(), Type.Null()]),
        lat: Type.Number(),
        lng: Type.Number(),
      })
    ),
  },
  { $id: 'RouteDetail' }
);

const RouteRef = Type.Object({
  id: Type.String(),
  code: Type.String(),
  name: Type.String(),
});

export const StopDetail = Type.Object(
  {
    id: Type.String({ description: 'id_paradero oficial' }),
    address: Type.Union([Type.String(), Type.Null()], { examples: ['CR 68A x CL 78B, Medellin'] }),
    lat: Type.Number(),
    lng: Type.Number(),
    routes: Type.Array(RouteRef),
  },
  { $id: 'StopDetail' }
);

export const NearbyStop = Type.Object(
  {
    ...StopDetail.properties,
    distanceM: Type.Integer({ description: 'Distancia en línea recta, en metros' }),
  },
  { $id: 'NearbyStop' }
);

export const HealthResponse = Type.Object({
  status: Type.Literal('ok'),
  uptimeS: Type.Integer(),
  network: Type.Object({
    generatedAt: Type.String(),
    routes: Type.Integer(),
    stops: Type.Integer(),
    footpaths: Type.Integer(),
    sources: Type.Object({
      routes: Type.Object({ file: Type.String(), updatedAt: Type.String() }),
      stops: Type.Object({
        file: Type.String(),
        updatedFrom: Type.String(),
        updatedTo: Type.String(),
      }),
    }),
  }),
  simulation: Type.Object({
    buses: Type.Integer(),
    spacingM: Type.Integer(),
    speedKmh: Type.Number(),
    realtimeClients: Type.Integer(),
  }),
});

export const Bus = Type.Object(
  {
    id: Type.String({ examples: ['90282-3'] }),
    routeId: Type.String(),
    lat: Type.Number(),
    lng: Type.Number(),
    heading: Type.Integer({ description: 'Rumbo en grados (0 = norte, 90 = oriente)' }),
    direction: Type.Union([Direction, Type.Null()], {
      description: 'Sentido actual; null mientras cruza un hueco entre sentidos',
    }),
    visible: Type.Boolean({ description: 'false si va hacia la terminal: no dibujarlo' }),
    atM: Type.Integer({ description: 'Posición sobre el circuito, en metros' }),
    nextStop: Type.Union([
      Type.Object({
        id: Type.String(),
        seq: Type.Integer(),
        distanceM: Type.Integer(),
        etaS: Type.Integer({ description: 'Segundos estimados de llegada' }),
      }),
      Type.Null(),
    ]),
  },
  { $id: 'Bus' }
);

export const RouteBuses = Type.Object({
  routeId: Type.String(),
  at: Type.Integer({ description: 'Instante de la simulación (epoch ms)' }),
  buses: Type.Array(Bus),
});

export const StopArrivals = Type.Object({
  stopId: Type.String(),
  at: Type.Integer({ description: 'Instante de la simulación (epoch ms)' }),
  routes: Type.Array(
    Type.Object({
      route: RouteRef,
      direction: Direction,
      seq: Type.Integer({ description: 'Número de la parada dentro de ese sentido' }),
      arrivals: Type.Array(
        Type.Object({
          busId: Type.String(),
          etaS: Type.Integer({ description: 'Segundos para que llegue' }),
          distanceM: Type.Integer({ description: 'Distancia por la ruta, en metros' }),
        })
      ),
    }),
    { description: 'Ordenado por la llegada más próxima' }
  ),
});

/** Latitud/longitud limitadas al Valle de Aburrá con margen. */
export const Latitude = Type.Number({ minimum: 5.9, maximum: 6.6, examples: [6.2518] });
export const Longitude = Type.Number({ minimum: -75.9, maximum: -75.3, examples: [-75.5636] });
