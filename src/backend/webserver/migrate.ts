import path from 'path';
import { runSqlMigrations } from '../shared/db/migrationRunner';

const MIGRATIONS_PATH = path.resolve(__dirname, '../shared/migrations');

const connectionString = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;

const main = async () => {
  if (!connectionString) {
    throw new Error('MIGRATION_DATABASE_URL or DATABASE_URL must be set');
  }

  const applied = await runSqlMigrations(connectionString, MIGRATIONS_PATH);

  if (applied.length === 0) {
    console.log('No new migrations to apply');
    return;
  }
  console.log(`Applied ${applied.length} migration(s):\n${applied.map(file => `  ${file}`).join('\n')}`);
};

main().catch(err => {
  console.error('Migration failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
