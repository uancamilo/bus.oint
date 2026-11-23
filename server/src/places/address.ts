/**
 * Interpretación de direcciones del sistema vial de Medellín.
 *
 * Las paradas oficiales traen direcciones como "CR 68A x CL 78B" (cruce) o "CL 50 66-50"
 * (placa: sobre la Calle 50, a la altura de la Carrera 66). Los usuarios escriben cosas como
 * "carrera 70 con calle 44" o "calle 10 # 43-25". Ambas se reducen a un conjunto de vías
 * (tipo + número) para poder compararlas.
 */
import { normalizeText } from '../text.ts';

export type StreetType = 'cl' | 'cr' | 'cq' | 'dg' | 'tv' | 'av';

export interface Street {
  type: StreetType;
  /** Número con letra, en minúsculas: "44", "68a", "78bb". */
  number: string;
}

const TYPE_WORDS: Record<string, StreetType> = {
  calle: 'cl',
  cll: 'cl',
  cl: 'cl',
  carrera: 'cr',
  cra: 'cr',
  carr: 'cr',
  kra: 'cr',
  kr: 'cr',
  cr: 'cr',
  circular: 'cq',
  cir: 'cq',
  cq: 'cq',
  diagonal: 'dg',
  diag: 'dg',
  dg: 'dg',
  transversal: 'tv',
  transv: 'tv',
  trans: 'tv',
  tv: 'tv',
  tr: 'tv',
  avenida: 'av',
  avda: 'av',
  av: 'av',
};

/** En una placa ("CL 50 66-50") la vía que cruza es del tipo complementario. */
const CROSS_TYPE: Partial<Record<StreetType, StreetType>> = {
  cl: 'cr',
  cr: 'cl',
  dg: 'tv',
  tv: 'dg',
};

const STREET_NUMBER = /^\d{1,3}[a-z]{0,2}$/;

/**
 * Extrae las vías de una dirección. Devuelve como máximo dos: la principal y la que cruza.
 * Ejemplos: "CR 68A x CL 78B" → cr 68a, cl 78b · "calle 10 # 43-25" → cl 10, cr 43.
 */
export function parseAddress(text: string): Street[] {
  const tokens = normalizeText(text)
    // "66-50" → "66", "9a-12" → "9a": la placa solo indica la vía que cruza
    .replace(/(\d[a-z]{0,2})\s*-\s*\d+/g, '$1')
    .replace(/[#,.]/g, ' ')
    .replace(/(\d)\s+([a-z]{1,2})\b(?!\w)/g, (match, digit: string, letters: string) =>
      // "44 a" → "44a", pero no "44 con" ni "44 sur"
      TYPE_WORDS[letters] || ['x', 'y', 'no', 'n'].includes(letters) ? match : `${digit}${letters}`
    )
    .split(' ')
    .filter(Boolean);

  const streets: Street[] = [];
  let pendingType: StreetType | undefined;
  for (const token of tokens) {
    const type = TYPE_WORDS[token];
    if (type) {
      pendingType = type;
      continue;
    }
    if (!STREET_NUMBER.test(token)) continue;
    const previous = streets.at(-1);
    const streetType = pendingType ?? (previous ? CROSS_TYPE[previous.type] : undefined);
    if (!streetType) continue;
    streets.push({ type: streetType, number: token });
    pendingType = undefined;
    if (streets.length === 2) break;
  }
  return streets;
}

/**
 * Qué tan bien coincide la dirección de una parada con la consulta (0 = no coincide).
 * 3: cruce exacto · 2: cruce, alguna vía sin la letra · 1: la consulta tiene una sola vía y coincide.
 */
export function addressMatchScore(query: Street[], candidate: Street[]): number {
  if (query.length === 0 || candidate.length === 0) return 0;
  const base = (n: string) => n.replace(/[a-z]+$/, '');
  let exact = 0;
  let loose = 0;
  for (const q of query) {
    if (candidate.some((c) => c.type === q.type && c.number === q.number)) exact++;
    else if (candidate.some((c) => c.type === q.type && base(c.number) === base(q.number))) loose++;
  }
  if (exact === query.length) return query.length === 1 ? 1 : 3;
  if (exact + loose === query.length) return query.length === 1 ? 1 : 2;
  return 0;
}

/** "CR 68A x CL 78B, Medellin" → "CR 68A x CL 78B" (para mostrar). */
export function shortAddress(address: string): string {
  return address.replace(/,\s*[^,]+$/, '').trim();
}
