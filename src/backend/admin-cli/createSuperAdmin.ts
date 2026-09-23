import { z } from 'zod';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, hashPassword } from '../shared/auth/passwords';
import type { WithTx } from '../shared/db/tx';

export class CliError extends Error {}

export const emailSchema = z.string().trim().max(254).pipe(z.email('Enter a valid email address.'));
export const fullNameSchema = z.string().trim().min(1, 'Enter a name.').max(200, 'The name is too long.');
const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `The password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
  .max(MAX_PASSWORD_LENGTH, 'The password is too long.');

const inputSchema = z.object({ email: emailSchema, fullName: fullNameSchema, password: passwordSchema });

export type SuperAdminInput = z.input<typeof inputSchema>;

export const parseOrFail = <S extends z.ZodType>(schema: S, value: unknown): z.infer<S> => {
  const result = schema.safeParse(value);
  if (!result.success) throw new CliError(result.error.issues[0]?.message ?? 'Invalid input.');
  return result.data;
};

export const createSuperAdmin = async (withTx: WithTx, input: SuperAdminInput) => {
  const { email, fullName, password } = parseOrFail(inputSchema, input);
  const passwordHash = await hashPassword(password);

  try {
    return await withTx(async db => {
      const role = await db.get<{ id: number }>('SELECT id FROM roles WHERE is_system ORDER BY id LIMIT 1');
      if (!role) throw new CliError('The Super Admin role is missing. Run the migrations first.');
      if (await db.get('SELECT id FROM users WHERE email = ?', [email])) {
        throw new CliError(`A user with the email ${email} already exists.`);
      }

      const id = await db.run(
        `INSERT INTO users (email, full_name, password_hash, role_id, all_offices) VALUES (?, ?, ?, ?, true)`,
        [email, fullName, passwordHash, role.id],
        true
      );
      await db.run(
        `INSERT INTO audit_logs (action, entity_type, entity_id, after, request_id)
         VALUES ('user.create', 'user', ?, ?, 'admin-cli')`,
        [String(id), { email, fullName, roleId: role.id, allOffices: true }]
      );
      return { id };
    });
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new CliError(`A user with the email ${email} already exists.`);
    }
    throw error;
  }
};
