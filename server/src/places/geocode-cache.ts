import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type { PlaceResult } from './places-types.ts';

/**
 * Caché de búsquedas externas (Nominatim). El prototipo usa SQLite (módulo nativo de Node,
 * sin dependencias); la interfaz permite cambiarlo por Redis o PostgreSQL en producción.
 */
export interface GeocodeCache {
  get(query: string): PlaceResult[] | undefined;
  set(query: string, results: PlaceResult[]): void;
  close(): void;
}

export class SqliteGeocodeCache implements GeocodeCache {
  private readonly db: DatabaseSync;

  /** `file` puede ser una ruta o ':memory:' (pruebas). */
  constructor(file: string) {
    if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS geocode_cache (
        query      TEXT PRIMARY KEY,
        results    TEXT    NOT NULL,
        created_at INTEGER NOT NULL,
        hits       INTEGER NOT NULL DEFAULT 0
      )
    `);
  }

  get(query: string): PlaceResult[] | undefined {
    const row = this.db.prepare('SELECT results FROM geocode_cache WHERE query = ?').get(query) as
      { results: string } | undefined;
    if (!row) return undefined;
    this.db.prepare('UPDATE geocode_cache SET hits = hits + 1 WHERE query = ?').run(query);
    return JSON.parse(row.results) as PlaceResult[];
  }

  set(query: string, results: PlaceResult[]): void {
    this.db
      .prepare(
        `INSERT INTO geocode_cache (query, results, created_at) VALUES (?, ?, ?)
         ON CONFLICT(query) DO UPDATE SET results = excluded.results, created_at = excluded.created_at`
      )
      .run(query, JSON.stringify(results), Date.now());
  }

  close(): void {
    this.db.close();
  }
}
