import { Pool } from 'pg';
import { MIN_PASSWORD_LENGTH } from '../shared/auth/passwords';
import { createWithTx, type WithTx } from '../shared/db/tx';
import { CliError, createSuperAdmin, emailSchema, fullNameSchema, parseOrFail } from './createSuperAdmin';
import { createPrompter } from './prompt';

const USAGE = `Usage: npm run admin -- create-super-admin
   or: docker compose run --rm admin-cli create-super-admin`;

const commands: Record<string, (withTx: WithTx) => Promise<void>> = {
  'create-super-admin': async withTx => {
    const prompt = createPrompter();
    try {
      const email = parseOrFail(emailSchema, await prompt.ask('Email: '));
      const fullName = parseOrFail(fullNameSchema, await prompt.ask('Full name: '));
      const password = await prompt.askHidden(`Password (at least ${MIN_PASSWORD_LENGTH} characters): `);
      if ((await prompt.askHidden('Repeat the password: ')) !== password) {
        throw new CliError('The passwords do not match.');
      }
      const { id } = await createSuperAdmin(withTx, { email, fullName, password });
      console.log(`Created Super Admin ${email} (user ${id}). They can sign in now.`);
    } finally {
      prompt.close();
    }
  }
};

const main = async () => {
  const command = commands[process.argv[2] ?? ''];
  if (!command) throw new CliError(USAGE);

  const connectionString = process.env.MIGRATION_DATABASE_URL;
  if (!connectionString) throw new CliError('MIGRATION_DATABASE_URL must be set.');

  const pool = new Pool({ connectionString, max: 1 });
  try {
    await command(createWithTx(pool));
  } finally {
    await pool.end();
  }
};

main().catch(error => {
  console.error(error instanceof CliError ? error.message : `admin-cli failed: ${(error as Error).message}`);
  process.exitCode = 1;
});
