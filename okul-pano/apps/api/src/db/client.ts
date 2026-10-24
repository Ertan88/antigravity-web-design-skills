import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema.ts';

export type DB = NodePgDatabase<typeof schema>;

export interface Database {
  db: DB;
  driver: 'postgres' | 'pglite';
  close(): Promise<void>;
}

function migrationsFolder(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // Kaynak: src/db/client.ts -> ../../drizzle, derlenmiş: dist/index.js -> ../drizzle
  const candidates = [resolve(here, '../../drizzle'), resolve(here, '../drizzle')];
  const found = candidates.find((c) => existsSync(resolve(c, 'meta/_journal.json')));
  if (!found) throw new Error('Veritabanı göç (migration) klasörü bulunamadı.');
  return found;
}

/**
 * DATABASE_URL verilirse PostgreSQL'e bağlanır; verilmezse gömülü PGlite kullanılır
 * (kurulum gerektirmeyen gerçek Postgres). Açılışta göçler otomatik uygulanır.
 */
export async function openDatabase(opts: { databaseUrl?: string; pgliteDir?: string; inMemory?: boolean }): Promise<Database> {
  const folder = migrationsFolder();

  if (opts.databaseUrl) {
    const pg = await import('pg');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    const pool = new pg.default.Pool({ connectionString: opts.databaseUrl, max: 10 });
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: folder });
    return { db, driver: 'postgres', close: () => pool.end() };
  }

  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');
  let client: InstanceType<typeof PGlite>;
  if (opts.inMemory) {
    client = new PGlite();
  } else {
    const dir = resolve(opts.pgliteDir ?? './data/pglite');
    mkdirSync(dir, { recursive: true });
    client = new PGlite(dir);
  }
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: folder });
  return { db: db as unknown as DB, driver: 'pglite', close: () => client.close() };
}
