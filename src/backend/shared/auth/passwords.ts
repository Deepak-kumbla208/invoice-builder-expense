import { argon2id, hash, verify } from 'argon2';

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 1024;

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
