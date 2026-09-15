import fs from 'fs';
import path from 'path';
import { Client } from 'pg';

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
