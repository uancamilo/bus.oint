import proj4 from 'proj4';

import type { Xy } from './geometry.ts';

/**
 * MAGNA-SIRGAS / Origen Nacional (EPSG:9377): sistema oficial de coordenadas de Colombia,
 * usado por los datos abiertos de Medellín. Parámetros según la resolución IGAC 471 de 2020.
 */
export const EPSG_9377 =
  '+proj=tmerc +lat_0=4 +lon_0=-73 +k=0.9992 +x_0=5000000 +y_0=2000000 ' +
  '+ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs';

const toWgs84 = proj4(EPSG_9377, 'EPSG:4326');

/** Convierte coordenadas EPSG:9377 (metros) a latitud y longitud WGS84. */
export function toLatLng(point: Xy): { lat: number; lng: number } {
  const [lng, lat] = toWgs84.forward([point[0], point[1]]);
  return { lat: lat!, lng: lng! };
}
