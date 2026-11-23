/** Lugar conocido de la lista curada (`data/places/lugares.json`). */
export interface KnownPlace {
  id: string;
  name: string;
  /** metro, universidad, centro comercial, parque, cultura, salud, transporte… */
  category: string;
  /** Otras formas de escribirlo: "udea", "u de a". */
  aliases: string[];
  lat: number;
  lng: number;
  /** Origen de las coordenadas en OpenStreetMap. */
  osm: { id: string; kind: string; displayName: string; query: string };
}

export type PlaceSource = 'lugar' | 'parada' | 'osm';

/** Resultado de búsqueda que devuelve la API. */
export interface PlaceResult {
  id: string;
  name: string;
  /** Texto secundario: categoría, dirección o descripción de OSM. */
  detail: string;
  lat: number;
  lng: number;
  /** lugar = lista curada · parada = dirección de un paradero · osm = Nominatim. */
  source: PlaceSource;
}
