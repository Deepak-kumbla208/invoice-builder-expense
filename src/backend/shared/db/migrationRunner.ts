import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
import { DatabaseType } from '../enums/databaseType';
import type { DatabaseAdapter } from '../types/DatabaseAdapter';
import { getColumnType, getDefaultValue } from '../utils/dbHelper';
import { mapDatabaseError } from '../utils/errorFunctions';

export const runMigrations = async (db: DatabaseAdapter, migrationsPath: string) => {
  let transactionStarted = false;
  try {
    if (!fs.existsSync(migrationsPath)) {
      return;
    }
    const files = fs
      .readdirSync(migrationsPath)
      .filter(f => /^\d{8}-\d{2}-.*\.(cjs|js|ts)$/.test(f))
      .sort();

    if (db.type === DatabaseType.sqlite) {
      await db.run('PRAGMA foreign_keys = OFF;');
    }
    await db.run('BEGIN');
    transactionStarted = true;

    await db.run(
      `
      CREATE TABLE IF NOT EXISTS migrations (
        "name" TEXT PRIMARY KEY,
        "appliedAt" ${getColumnType('DATETIME', db.type)} NOT NULL DEFAULT ${getDefaultValue("(datetime('now'))", db.type)}
      );
    `
    );

    for (const file of files) {
      const name = path.basename(file);

      const row = await db.get(`SELECT 1 FROM migrations WHERE "name" = ?`, [name]);

      if (!row) {
        const migrationPath = path.resolve(migrationsPath, file);
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const migration = require(migrationPath);
        if (typeof migration.up !== 'function') {
          throw new Error(`error.noUpFunction`);
        }
        if (migration.up) {
          await migration.up(db);
          await db.run(`INSERT INTO migrations("name") VALUES(?)`, [name]);
        }
      }
    }

    await db.run('COMMIT');

    if (db.type === DatabaseType.sqlite) {
      await db.run('PRAGMA foreign_keys = ON;');
    }
    return { success: true, message: undefined, data: undefined, key: undefined };
  } catch (error) {
    if (transactionStarted) {
      try {
        await db.run('ROLLBACK');
      } catch {
        throw new Error(`error.rollbackFailed`);
      }
    }

    if (db.type === DatabaseType.sqlite) {
      await db.run('PRAGMA foreign_keys = ON;');
    }
    return { success: false, ...mapDatabaseError(error, db.type) };
  }
};

export const runSqlMigrations = async (connectionString: string, migrationsPath: string): Promise<string[]> => {
  const files = fs
    .readdirSync(migrationsPath)
    .filter(f => /^\d{4}-[\w-]+\.sql$/.test(f))
    .sort();

  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query(
      `CREATE TABLE IF NOT EXISTS migrations ("name" TEXT PRIMARY KEY, "appliedAt" TIMESTAMP NOT NULL DEFAULT now())`
    );
    const { rows } = await client.query<{ name: string }>(`SELECT "name" FROM migrations`);
    const applied = new Set(rows.map(row => row.name));

    const newlyApplied: string[] = [];
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = fs.readFileSync(path.join(migrationsPath, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(`INSERT INTO migrations ("name") VALUES ($1)`, [file]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
      }
      newlyApplied.push(file);
    }
    return newlyApplied;
  } finally {
    await client.end();
  }
};
