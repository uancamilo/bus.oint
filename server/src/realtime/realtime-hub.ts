/**
 * Difusión en tiempo real de las posiciones de los buses por WebSocket.
 *
 * Protocolo (mensajes JSON):
 *
 *   cliente → servidor
 *     { "type": "subscribe", "routeIds": ["90282", "90283"] }   reemplaza la suscripción
 *     { "type": "subscribe", "routeIds": [] }                   deja de recibir buses
 *
 *   servidor → cliente
 *     { "type": "welcome", "tickMs": 1000, "maxRoutes": 20 }
 *     { "type": "subscribed", "routeIds": [...], "unknownRouteIds": [...] }
 *     { "type": "buses", "at": 1732300000000, "routes": { "90282": [Bus, ...] } }
 *     { "type": "error", "message": "..." }
 *
 * El servidor solo calcula y envía las rutas que alguien está viendo, y solo mantiene el
 * temporizador activo mientras haya clientes conectados.
 */
import type { BusSimulator, BusState } from '../simulation/bus-simulator.ts';

/** Lo mínimo que el hub necesita de un socket (facilita las pruebas). */
export interface RealtimeSocket {
  readonly readyState: number;
  send(data: string): void;
  on(event: 'message', listener: (data: unknown) => void): void;
  on(event: 'close', listener: () => void): void;
}

const OPEN = 1;
export const MAX_ROUTES_PER_CLIENT = 20;

export type ServerMessage =
  | { type: 'welcome'; tickMs: number; maxRoutes: number }
  | { type: 'subscribed'; routeIds: string[]; unknownRouteIds: string[] }
  | { type: 'buses'; at: number; routes: Record<string, BusState[]> }
  | { type: 'error'; message: string };

export class RealtimeHub {
  private readonly clients = new Map<RealtimeSocket, Set<string>>();
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly simulator: BusSimulator,
    readonly tickMs: number
  ) {}

  get clientCount(): number {
    return this.clients.size;
  }

  connect(socket: RealtimeSocket): void {
    this.clients.set(socket, new Set());
    send(socket, { type: 'welcome', tickMs: this.tickMs, maxRoutes: MAX_ROUTES_PER_CLIENT });
    socket.on('message', (data) => this.handleMessage(socket, data));
    socket.on('close', () => {
      this.clients.delete(socket);
      if (this.clients.size === 0) this.stopTimer();
    });
    this.startTimer();
  }

  close(): void {
    this.stopTimer();
    this.clients.clear();
  }

  private handleMessage(socket: RealtimeSocket, data: unknown): void {
    let message: unknown;
    try {
      message = JSON.parse(String(data));
    } catch {
      send(socket, { type: 'error', message: 'El mensaje debe ser JSON válido' });
      return;
    }
    if (!isSubscribe(message)) {
      send(socket, {
        type: 'error',
        message: 'Mensaje no reconocido. Usa {"type":"subscribe","routeIds":["90282"]}',
      });
      return;
    }
    const requested = [...new Set(message.routeIds)];
    if (requested.length > MAX_ROUTES_PER_CLIENT) {
      send(socket, {
        type: 'error',
        message: `Máximo ${MAX_ROUTES_PER_CLIENT} rutas por conexión (llegaron ${requested.length})`,
      });
      return;
    }
    const known = requested.filter((id) => this.simulator.hasRoute(id));
    const unknown = requested.filter((id) => !this.simulator.hasRoute(id));
    this.clients.set(socket, new Set(known));
    send(socket, { type: 'subscribed', routeIds: known, unknownRouteIds: unknown });
    // Envío inmediato para no esperar al siguiente ciclo.
    if (known.length > 0) this.broadcast([socket]);
  }

  private startTimer(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.broadcast(), this.tickMs);
    this.timer.unref();
  }

  private stopTimer(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Calcula cada ruta una sola vez por ciclo y envía a cada cliente solo lo suyo. */
  private broadcast(targets: Iterable<RealtimeSocket> = this.clients.keys()): void {
    const at = this.simulator.now();
    const cache = new Map<string, BusState[]>();
    for (const socket of targets) {
      const routeIds = this.clients.get(socket);
      if (!routeIds || routeIds.size === 0 || socket.readyState !== OPEN) continue;
      const routes: Record<string, BusState[]> = {};
      for (const id of routeIds) {
        let buses = cache.get(id);
        if (!buses) {
          buses = this.simulator.busesOnRoute(id, at);
          cache.set(id, buses);
        }
        routes[id] = buses;
      }
      send(socket, { type: 'buses', at, routes });
    }
  }
}

function send(socket: RealtimeSocket, message: ServerMessage): void {
  if (socket.readyState === OPEN) socket.send(JSON.stringify(message));
}

function isSubscribe(value: unknown): value is { type: 'subscribe'; routeIds: string[] } {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { type?: unknown; routeIds?: unknown };
  return (
    candidate.type === 'subscribe' &&
    Array.isArray(candidate.routeIds) &&
    candidate.routeIds.every((id) => typeof id === 'string')
  );
}
