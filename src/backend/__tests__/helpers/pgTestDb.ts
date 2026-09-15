import { randomBytes } from 'crypto';
import { Client } from 'pg';
import { createPostgresAdapter } from '../../shared/db/client';
import { initInitialData, initSchema } from '../../shared/db/setup';
import type { DatabaseAdapter } from '../../shared/types/DatabaseAdapter';

type Migration = { up: (db: DatabaseAdapter) => Promise<{ success: boolean; key?: string; message?: string } | void> };

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5433/postgres';

const legacyMigrations = import.meta.glob<Migration>('../../shared/migrations/*.ts', { eager: true });

const withAdminClient = async <T>(fn: (client: Client) => Promise<T>): Promise<T> => {
  const client = new Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
};

const runLegacyMigrations = async (db: DatabaseAdapter, stopBefore?: string) => {
  await db.run(
    `CREATE TABLE IF NOT EXISTS migrations ("name" TEXT PRIMARY KEY, "appliedAt" TIMESTAMP NOT NULL DEFAULT now());`
  );
  const entries = Object.entries(legacyMigrations).sort(([a], [b]) => a.localeCompare(b));
  for (const [file, migration] of entries) {
    const name = file.split('/').pop() as string;
    if (stopBefore && name >= stopBefore) break;
    await db.run('BEGIN');
    try {
      const result = await migration.up(db);
      if (result && result.success === false) throw new Error(result.message ?? result.key);
      await db.run(`INSERT INTO migrations("name") VALUES(?)`, [name]);
      await db.run('COMMIT');
    } catch (error) {
      await db.run('ROLLBACK');
      throw new Error(`Migration ${name} failed: ${(error as Error).message}`);
    }
  }
};

export type PgTestDb = { db: DatabaseAdapter; databaseName: string; drop: () => Promise<void> };

export const createPgTestDb = async (options: { stopBefore?: string } = {}): Promise<PgTestDb> => {
  const databaseName = `t_${randomBytes(6).toString('hex')}`;
  await withAdminClient(client => client.query(`CREATE DATABASE "${databaseName}"`));

  const url = new URL(TEST_DATABASE_URL);
  url.pathname = `/${databaseName}`;
  const db = createPostgresAdapter(url.toString());

  await initSchema(db);
  await initInitialData(db);
  await runLegacyMigrations(db, options.stopBefore);

  const drop = async () => {
    await db.close();
    await withAdminClient(client => client.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`));
  };

  return { db, databaseName, drop };
};
