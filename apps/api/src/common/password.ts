import { randomBytes } from 'crypto';
import { argon2Verify, argon2id } from 'hash-wasm';

/**
 * Password hashing with argon2id, run as WebAssembly so it works the same on a laptop, a container
 * and a serverless function (the native argon2 module needs a matching binary on every host).
 * Output is the standard "$argon2id$..." string, so hashes made by any argon2 library still verify.
 * Settings match the common defaults: 64 MiB, 3 passes, 4 lanes.
 */
export const hash = (password: string) =>
  argon2id({
    password,
    salt: randomBytes(16),
    parallelism: 4,
    iterations: 3,
    memorySize: 65536,
    hashLength: 32,
    outputType: 'encoded',
  });

export const verify = async (encoded: string, password: string) => {
  try {
    return await argon2Verify({ password, hash: encoded });
  } catch {
    return false; // malformed stored hash
  }
};
