import { randomInt } from 'crypto';
import { argon2id, hash, verify } from 'argon2';

export { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from './passwordPolicy';

let dummyHash: Promise<string> | undefined;

export const hashPassword = (password: string) => hash(password, { type: argon2id });

export const verifyPassword = async (passwordHash: string, password: string) => {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
};

// Verifies against a throwaway hash so an unknown email costs as much time as a wrong password.
export const burnPasswordCheck = async (password: string) => {
  dummyHash ??= hashPassword('not-a-real-password');
  await verifyPassword(await dummyHash, password);
};

const TEMPORARY_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const TEMPORARY_PASSWORD_LENGTH = 16;

export const generateTemporaryPassword = () =>
  Array.from(
    { length: TEMPORARY_PASSWORD_LENGTH },
    () => TEMPORARY_PASSWORD_ALPHABET[randomInt(TEMPORARY_PASSWORD_ALPHABET.length)]
  ).join('');
