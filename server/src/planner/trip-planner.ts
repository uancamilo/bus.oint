/**
 * Planificador de viajes en bus con hasta 2 transbordos.
 *
 * Usa el algoritmo RAPTOR (Round-bAsed Public Transit Optimized Router, Delling et al.,
 * Microsoft Research 2012), adaptado a la simulación:
 *
 *  - Cada ronda agrega un bus: ronda 1 = directo, ronda 2 = un transbordo, ronda 3 = dos.
 *  - Las esperas no salen de horarios supuestos sino de las posiciones simuladas: al llegar
 *    a una parada se pregunta al simulador cuándo pasa el próximo bus de cada ruta.
 *  - Entre rondas se puede caminar entre paradas cercanas (≤ 250 m) para transbordar.
 *
 * Además, las opciones directas se enumeran todas (una por ruta) para ofrecer varias rutas,
 * y un viaje con más transbordos solo se muestra si llega claramente antes.
 */
import type { Direction, Route, Stop } from '../data/network-types.ts';
import { haversine } from '../geo/geometry.ts';
import type { NetworkRepository } from '../network/network-store.ts';
import { shortAddress } from '../places/address.ts';
import type { BusSimulator } from '../simulation/bus-simulator.ts';

export interface PlannerConfig {
  /** Distancia máxima a pie hasta la primera parada y desde la última (metros, línea recta). */
  maxWalkM: number;
  walkSpeedKmh: number;
  /** Factor para pasar de línea recta a distancia caminando por calles. */
  walkDetour: number;
  /** Margen para transbordar de un bus a otro (segundos). */
  transferBufferS: number;
  maxTransfers: number;
  maxOptions: number;
  /** Un viaje con más transbordos se muestra solo si llega al menos esto antes (segundos). */
  transferGainS: number;
  /** Se ofrece ir caminando si la distancia es menor que esto (metros, línea recta). */
  maxWalkOnlyM: number;
}

export const DEFAULT_PLANNER: PlannerConfig = {
  maxWalkM: 500,
  walkSpeedKmh: 4.8,
  walkDetour: 1.25,
  transferBufferS: 60,
  maxTransfers: 2,
  maxOptions: 5,
  transferGainS: 180,
  maxWalkOnlyM: 1500,
};

export interface Point {
  lat: number;
  lng: number;
  name?: string;
}

export interface LegPlace {
  name: string;
  lat: number;
  lng: number;
  stopId?: string;
}

interface LegBase {
  from: LegPlace;
  to: LegPlace;
  /** epoch ms */
  departAt: number;
  arriveAt: number;
  durationS: number;
  distanceM: number;
  /** Polilínea [lat, lng] para dibujar el tramo. */
  path: [number, number][];
}

export type JourneyLeg =
  | (LegBase & { type: 'walk' })
  | (LegBase & {
      type: 'bus';
      route: { id: string; code: string; name: string };
      direction: Direction;
      busId: string;
      /** Espera en la parada antes de subir (segundos). */
      waitS: number;
      /** Paradas que recorre (sin contar la de subida). */
      stopCount: number;
    });

export interface Journey {
  departAt: number;
  arriveAt: number;
  durationS: number;
  transfers: number;
  walkM: number;
  waitS: number;
  /** Códigos de las rutas en orden, por ejemplo ["190", "C23"]. */
  routeCodes: string[];
  legs: JourneyLeg[];
}

export interface PlanResult {
  at: number;
  journeys: Journey[];
  notices: string[];
}

interface Pattern {
  route: Route;
  direction: Direction;
  stops: number[];
  atM: number[];
}

type Parent =
  | { kind: 'access'; distanceM: number }
  | { kind: 'walk'; from: number; distanceM: number }
  | { kind: 'ride'; pattern: number; boardPos: number; alightPos: number };

/** Esqueleto de un viaje antes de calcular horas: tramos a pie y en bus. */
type Step =
  | { kind: 'walk'; from: LegPlace; to: LegPlace; straightM: number }
  | { kind: 'bus'; pattern: number; boardPos: number; alightPos: number };

export class TripPlanner {
  private readonly stops: Stop[] = [];
  private readonly stopIndex = new Map<string, number>();
  private readonly patterns: Pattern[] = [];
  /** Para cada parada: en qué patrones y en qué posición aparece. */
  private readonly stopPatterns: [number, number][][] = [];
  private readonly footpaths: [number, number][][] = [];
  private readonly walkMps: number;

  constructor(
    private readonly network: NetworkRepository,
    private readonly simulator: BusSimulator,
    readonly config: PlannerConfig = DEFAULT_PLANNER
  ) {
    this.walkMps = config.walkSpeedKmh / 3.6;
    for (const stop of network.allStops()) {
      this.stopIndex.set(stop.id, this.stops.length);
      this.stops.push(stop);
      this.stopPatterns.push([]);
      this.footpaths.push([]);
    }
    for (const route of network.allRoutes()) {
      for (const direction of ['ida', 'vuelta'] as const) {
        const routeStops = route.stops.filter((s) => s.direction === direction);
        if (routeStops.length < 2) continue;
        const pattern: Pattern = { route, direction, stops: [], atM: [] };
        for (const routeStop of routeStops) {
          const index = this.stopIndex.get(routeStop.stopId);
          if (index === undefined) continue;
          this.stopPatterns[index]!.push([this.patterns.length, pattern.stops.length]);
          pattern.stops.push(index);
          pattern.atM.push(routeStop.atM);
        }
        this.patterns.push(pattern);
      }
    }
    for (const [a, b, meters] of network.footpaths()) {
      const ia = this.stopIndex.get(a);
      const ib = this.stopIndex.get(b);
      if (ia === undefined || ib === undefined) continue;
      this.footpaths[ia]!.push([ib, meters]);
      this.footpaths[ib]!.push([ia, meters]);
    }
  }

  plan(origin: Point, destination: Point, nowMs = this.simulator.now()): PlanResult {
    const notices: string[] = [];
    const originPlace: LegPlace = {
      name: origin.name ?? 'Origen',
      lat: origin.lat,
      lng: origin.lng,
    };
    const destinationPlace: LegPlace = {
      name: destination.name ?? 'Destino',
      lat: destination.lat,
      lng: destination.lng,
    };

    const access = this.nearbyWithFallback(origin, 'origen', notices);
    const egress = this.nearbyWithFallback(destination, 'destino', notices);
    const candidates: Step[][] = [];

    // 1. Opciones directas: una por cada ruta que sirve (la mejor parada de subida y bajada).
    candidates.push(...this.directOptions(access, egress, originPlace, destinationPlace, nowMs));

    // 2. Con transbordos: RAPTOR.
    candidates.push(...this.raptor(access, egress, originPlace, destinationPlace, nowMs));

    // 3. Caminando, si es cerca.
    const straight = haversine(origin.lat, origin.lng, destination.lat, destination.lng);
    if (straight <= this.config.maxWalkOnlyM) {
      candidates.push([
        { kind: 'walk', from: originPlace, to: destinationPlace, straightM: straight },
      ]);
    }

    const journeys = this.selectJourneys(candidates.map((steps) => this.timeJourney(steps, nowMs)));
    if (journeys.length === 0) {
      notices.push(
        'No encontramos una forma de llegar en bus con hasta ' +
          `${this.config.maxTransfers} transbordos. Prueba con un punto de origen o destino más cercano a una vía principal.`
      );
    }
    return { at: nowMs, journeys, notices };
  }

  // ---------------------------------------------------------------------------------------

  private nearbyWithFallback(point: Point, label: string, notices: string[]) {
    let stops = this.network.nearbyStops(point.lat, point.lng, this.config.maxWalkM, 30);
    if (stops.length === 0) {
      const wider = this.config.maxWalkM * 2;
      stops = this.network.nearbyStops(point.lat, point.lng, wider, 30);
      if (stops.length > 0) {
        notices.push(
          `No hay paradas a menos de ${this.config.maxWalkM} m del ${label}; se buscó hasta ${wider} m.`
        );
      }
    }
    return stops
      .map((s) => ({ index: this.stopIndex.get(s.id)!, distanceM: s.distanceM }))
      .filter((s) => s.index !== undefined);
  }

  private walkMs(straightM: number): number {
    return ((straightM * this.config.walkDetour) / this.walkMps) * 1000;
  }

  private rideMs(meters: number): number {
    return (meters / this.simulator.speedMps) * 1000;
  }

  private stopPlace(index: number): LegPlace {
    const stop = this.stops[index]!;
    return {
      name: stop.address ? shortAddress(stop.address) : `Parada ${stop.id}`,
      lat: stop.lat,
      lng: stop.lng,
      stopId: stop.id,
    };
  }

  private directOptions(
    access: { index: number; distanceM: number }[],
    egress: { index: number; distanceM: number }[],
    origin: LegPlace,
    destination: LegPlace,
    nowMs: number
  ): Step[][] {
    // Para cada patrón, las paradas de bajada cercanas al destino.
    const egressByPattern = new Map<number, { pos: number; distanceM: number }[]>();
    for (const e of egress) {
      for (const [pattern, pos] of this.stopPatterns[e.index]!) {
        const list = egressByPattern.get(pattern) ?? [];
        list.push({ pos, distanceM: e.distanceM });
        egressByPattern.set(pattern, list);
      }
    }
    const bestByRoute = new Map<string, { arrival: number; steps: Step[] }>();
    for (const a of access) {
      for (const [patternIndex, boardPos] of this.stopPatterns[a.index]!) {
        const exits = egressByPattern.get(patternIndex);
        if (!exits) continue;
        const pattern = this.patterns[patternIndex]!;
        const bus = this.simulator.nextBus(
          pattern.route.id,
          pattern.atM[boardPos]!,
          nowMs + this.walkMs(a.distanceM)
        );
        if (!bus) continue;
        for (const exit of exits) {
          if (exit.pos <= boardPos) continue;
          const arrival =
            bus.atMs +
            this.rideMs(pattern.atM[exit.pos]! - pattern.atM[boardPos]!) +
            this.walkMs(exit.distanceM);
          // Una opción por ruta: si pasa en ambos sentidos, el más rápido.
          const key = pattern.route.id;
          const current = bestByRoute.get(key);
          if (current && current.arrival <= arrival) continue;
          bestByRoute.set(key, {
            arrival,
            steps: [
              { kind: 'walk', from: origin, to: this.stopPlace(a.index), straightM: a.distanceM },
              { kind: 'bus', pattern: patternIndex, boardPos, alightPos: exit.pos },
              {
                kind: 'walk',
                from: this.stopPlace(pattern.stops[exit.pos]!),
                to: destination,
                straightM: exit.distanceM,
              },
            ],
          });
        }
      }
    }
    return [...bestByRoute.values()].map((option) => option.steps);
  }

  private raptor(
    access: { index: number; distanceM: number }[],
    egress: { index: number; distanceM: number }[],
    origin: LegPlace,
    destination: LegPlace,
    nowMs: number
  ): Step[][] {
    const n = this.stops.length;
    const rounds = this.config.maxTransfers + 1;
    const labels: Float64Array[] = [new Float64Array(n).fill(Infinity)];
    const parents: (Parent | undefined)[][] = [new Array<Parent | undefined>(n)];
    const best = new Float64Array(n).fill(Infinity);
    let marked = new Set<number>();

    for (const a of access) {
      const t = nowMs + this.walkMs(a.distanceM);
      if (t < labels[0]![a.index]!) {
        labels[0]![a.index] = t;
        best[a.index] = t;
        parents[0]![a.index] = { kind: 'access', distanceM: a.distanceM };
        marked.add(a.index);
      }
    }

    for (let k = 1; k <= rounds && marked.size > 0; k++) {
      const previous = labels[k - 1]!;
      const current = Float64Array.from(previous);
      const roundParents = new Array<Parent | undefined>(n);
      labels.push(current);
      parents.push(roundParents);
      const buffer = k > 1 ? this.config.transferBufferS * 1000 : 0;

      // Patrones que pasan por paradas mejoradas en la ronda anterior, desde la primera.
      const queue = new Map<number, number>();
      for (const stop of marked) {
        for (const [pattern, pos] of this.stopPatterns[stop]!) {
          const existing = queue.get(pattern);
          if (existing === undefined || pos < existing) queue.set(pattern, pos);
        }
      }
      const improved = new Set<number>();

      for (const [patternIndex, startPos] of queue) {
        const pattern = this.patterns[patternIndex]!;
        // `tripRef`: instante en que el bus abordado "estaría" en atM = 0; define el bus.
        let tripRef = Infinity;
        let boardPos = -1;
        for (let pos = startPos; pos < pattern.stops.length; pos++) {
          const stop = pattern.stops[pos]!;
          const atM = pattern.atM[pos]!;
          if (tripRef < Infinity) {
            const arrival = tripRef + this.rideMs(atM);
            if (arrival < best[stop]!) {
              current[stop] = arrival;
              best[stop] = arrival;
              roundParents[stop] = {
                kind: 'ride',
                pattern: patternIndex,
                boardPos,
                alightPos: pos,
              };
              improved.add(stop);
            }
          }
          const ready = previous[stop]!;
          if (ready < Infinity) {
            const bus = this.simulator.nextBus(pattern.route.id, atM, ready + buffer);
            if (bus) {
              const ref = bus.atMs - this.rideMs(atM);
              if (ref < tripRef - 1) {
                tripRef = ref;
                boardPos = pos;
              }
            }
          }
        }
      }

      // Caminatas cortas entre paradas para transbordar.
      for (const stop of [...improved]) {
        for (const [other, meters] of this.footpaths[stop]!) {
          const t = current[stop]! + this.walkMs(meters);
          if (t < best[other]!) {
            current[other] = t;
            best[other] = t;
            roundParents[other] = { kind: 'walk', from: stop, distanceM: meters };
            improved.add(other);
          }
        }
      }
      marked = improved;
    }

    // La mejor bajada en cada ronda, reconstruida hacia atrás.
    const options: Step[][] = [];
    for (let k = 2; k < labels.length; k++) {
      let bestArrival = Infinity;
      let bestExit: { index: number; distanceM: number } | undefined;
      for (const e of egress) {
        const t = labels[k]![e.index]! + this.walkMs(e.distanceM);
        if (t < bestArrival) {
          bestArrival = t;
          bestExit = e;
        }
      }
      if (!bestExit) continue;
      const steps = this.reconstruct(parents, k, bestExit, origin, destination);
      if (steps) options.push(steps);
    }
    return options;
  }

  private reconstruct(
    parents: (Parent | undefined)[][],
    round: number,
    exit: { index: number; distanceM: number },
    origin: LegPlace,
    destination: LegPlace
  ): Step[] | null {
    const steps: Step[] = [
      {
        kind: 'walk',
        from: this.stopPlace(exit.index),
        to: destination,
        straightM: exit.distanceM,
      },
    ];
    let stop = exit.index;
    let k = round;
    for (let guard = 0; guard < 20; guard++) {
      while (k > 0 && parents[k]![stop] === undefined) k--;
      const parent = parents[k]![stop];
      if (!parent) return null;
      if (parent.kind === 'access') {
        steps.unshift({
          kind: 'walk',
          from: origin,
          to: this.stopPlace(stop),
          straightM: parent.distanceM,
        });
        return mergeWalks(steps);
      }
      if (parent.kind === 'walk') {
        steps.unshift({
          kind: 'walk',
          from: this.stopPlace(parent.from),
          to: this.stopPlace(stop),
          straightM: parent.distanceM,
        });
        stop = parent.from;
        continue;
      }
      steps.unshift({
        kind: 'bus',
        pattern: parent.pattern,
        boardPos: parent.boardPos,
        alightPos: parent.alightPos,
      });
      stop = this.patterns[parent.pattern]!.stops[parent.boardPos]!;
      k--;
    }
    return null;
  }

  /** Recorre el esqueleto desde `nowMs` calculando esperas, buses y horas reales. */
  private timeJourney(steps: Step[], nowMs: number): Journey {
    const legs: JourneyLeg[] = [];
    let t = nowMs;
    let busLegs = 0;
    for (const step of steps) {
      if (step.kind === 'walk') {
        const distanceM = Math.round(step.straightM * this.config.walkDetour);
        if (distanceM < 1) continue;
        const arriveAt = t + this.walkMs(step.straightM);
        legs.push({
          type: 'walk',
          from: step.from,
          to: step.to,
          departAt: Math.round(t),
          arriveAt: Math.round(arriveAt),
          durationS: Math.round((arriveAt - t) / 1000),
          distanceM,
          path: [
            [step.from.lat, step.from.lng],
            [step.to.lat, step.to.lng],
          ],
        });
        t = arriveAt;
        continue;
      }
      const pattern = this.patterns[step.pattern]!;
      const fromM = pattern.atM[step.boardPos]!;
      const toM = pattern.atM[step.alightPos]!;
      const ready = t + (busLegs > 0 ? this.config.transferBufferS * 1000 : 0);
      const bus = this.simulator.nextBus(pattern.route.id, fromM, ready)!;
      const arriveAt = bus.atMs + this.rideMs(toM - fromM);
      legs.push({
        type: 'bus',
        route: { id: pattern.route.id, code: pattern.route.code, name: pattern.route.name },
        direction: pattern.direction,
        busId: bus.busId,
        from: this.stopPlace(pattern.stops[step.boardPos]!),
        to: this.stopPlace(pattern.stops[step.alightPos]!),
        departAt: Math.round(bus.atMs),
        arriveAt: Math.round(arriveAt),
        durationS: Math.round((arriveAt - bus.atMs) / 1000),
        waitS: Math.round((bus.atMs - t) / 1000),
        distanceM: Math.round(toM - fromM),
        stopCount: step.alightPos - step.boardPos,
        path: this.simulator.pathBetween(pattern.route.id, fromM, toM),
      });
      busLegs++;
      t = arriveAt;
    }
    const busOnly = legs.filter((l) => l.type === 'bus');
    return {
      departAt: nowMs,
      arriveAt: Math.round(t),
      durationS: Math.round((t - nowMs) / 1000),
      transfers: Math.max(0, busOnly.length - 1),
      walkM: legs.filter((l) => l.type === 'walk').reduce((sum, l) => sum + l.distanceM, 0),
      waitS: busOnly.reduce((sum, l) => sum + l.waitS, 0),
      routeCodes: busOnly.map((l) => l.route.code),
      legs,
    };
  }

  /**
   * Ordena por llegada, luego menos transbordos, luego menos caminata. Descarta duplicados
   * y viajes con más transbordos que no llegan claramente antes que uno con menos.
   */
  private selectJourneys(journeys: Journey[]): Journey[] {
    const seen = new Set<string>();
    const unique = journeys.filter((j) => {
      const key = j.legs
        .map((l) => (l.type === 'bus' ? `${l.route.id}:${l.from.stopId}>${l.to.stopId}` : 'walk'))
        .join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    // Si caminar es más rápido, no tiene sentido ofrecer un bus que llega después.
    const walkOnly = unique.find((j) => j.legs.every((l) => l.type === 'walk'));
    const bestWith = (maxTransfers: number) =>
      Math.min(
        ...unique
          .filter((j) => j.transfers < maxTransfers && j.legs.some((l) => l.type === 'bus'))
          .map((j) => j.arriveAt)
      );
    return unique
      .filter((j) => j === walkOnly || !walkOnly || j.arriveAt < walkOnly.arriveAt)
      .filter(
        (j) =>
          j.transfers === 0 || j.arriveAt < bestWith(j.transfers) - this.config.transferGainS * 1000
      )
      .sort((a, b) => a.arriveAt - b.arriveAt || a.transfers - b.transfers || a.walkM - b.walkM)
      .slice(0, this.config.maxOptions);
  }
}

/** Une caminatas consecutivas (p. ej. acceso + caminata de transbordo) en un solo tramo. */
function mergeWalks(steps: Step[]): Step[] {
  const result: Step[] = [];
  for (const step of steps) {
    const last = result.at(-1);
    if (step.kind === 'walk' && last?.kind === 'walk') {
      result[result.length - 1] = {
        kind: 'walk',
        from: last.from,
        to: step.to,
        straightM: last.straightM + step.straightM,
      };
    } else {
      result.push(step);
    }
  }
  return result;
}
