# Datos de transporte público de Medellín

Fuente oficial de rutas y paradas de bus que usa el backend (`server/`).

## Archivos originales (versionados en git)

| Archivo | Contenido | Registros | Actualización |
|---|---|---|---|
| `rutas_de_transporte_publi.geojson` | Trazados de rutas de bus (LineString / MultiLineString) | 504 trazados = 252 rutas × 2 sentidos | 2025-08-14 |
| `paradas_de_transporte_pub.geojson` | Paradas por ruta y sentido (Point) | 10.043 registros, 3.590 paraderos físicos | 2018-08-01 a 2026-02-27 |

- **Origen:** portal de Datos Abiertos de la Alcaldía de Medellín, descargados en formato GeoJSON el 2026-11-22.
- **Sistema de coordenadas:** EPSG:9377 (MAGNA-SIRGAS / Origen Nacional), en metros. Las paradas traen además `latitud` y `longitud` en WGS84.
- **Licencia y URL:** _pendiente de completar con los datos de la página de cada conjunto de datos._

Huellas SHA-256, para saber si un archivo cambió al volver a descargarlo:

```
bce26bff89ce7a053fc998f8a66b52fd9c8e9a6b74e4fdaf4ac96a0f38a6f412  rutas_de_transporte_publi.geojson
80afb228ab6fd4317452f4fbb2b53a9efa50981c65950695618f5409ccf4fadd  paradas_de_transporte_pub.geojson
```

### Campos usados

**Rutas:** `id_ruta`, `codigo`, `nombre`, `recorrido` (Origen-Destino / Destino-Origen), `tipo`, `sistema`, `empresa`, `fecha_actualizacion`.

**Paradas:** `id_paradero` (parada física, compartida entre rutas), `id_ruta`, `nro_parada` (orden en el recorrido), `recorrido`, `direccion`, `latitud`, `longitud`, `fecha_actualizacion`.

## Datos procesados (generados, ignorados por git)

```bash
cd server && npm run data:build
```

Genera en `data/processed/`:

- `network.json`: red lista para cargar en memoria (formato en `server/src/data/network-types.ts`).
- `build-report.json`: métricas de calidad y lista de rutas excluidas o con avisos.

El script:

1. Convierte EPSG:9377 a latitud/longitud y valida la conversión contra las coordenadas WGS84 oficiales de las paradas (error máximo actual: 1 mm).
2. Une los trazados de varias partes y los orienta según el orden oficial de las paradas: 159 de 504 trazados venían dibujados en sentido contrario al recorrido.
3. Excluye los trazados con tramos repetidos por errores de digitalización (hoy 13 rutas; por ejemplo, las rutas 98 a Santa Elena con trazados de más de 100 km).
4. Simplifica los trazados con una tolerancia de 3 m (de 294.645 a 57.384 puntos) y arma un circuito cerrado por ruta: ida, hueco, vuelta, hueco.
   - Hueco ≤ 300 m: _conector_, el bus se ve avanzar en línea recta.
   - Hueco > 300 m: _a terminal_, el bus no se dibuja en ese tramo.
5. Ubica cada parada sobre el circuito, en metros desde el inicio, y calcula las conexiones a pie de hasta 250 m entre paraderos, para los transbordos.

Si la Alcaldía publica datos nuevos, reemplaza el GeoJSON correspondiente (con el mismo nombre), actualiza la tabla y las huellas de este archivo y vuelve a ejecutar `npm run data:build`.
