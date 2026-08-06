import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

// OWASP-recommended scrypt floor (N=2^17, r=8, p=1). ~130ms and ~128MB per hash
// on a modern core — deliberately slow, that is the entire point.
const PARAMS = { N: 1 << 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

/**
 * Node's built-in scrypt — no bcrypt/argon2 native build step to break on
 * Vercel's build image. scrypt is memory-hard and an accepted password KDF.
 *
 * Format: scrypt$N$r$p$<salt base64>$<hash base64>
 * The parameters are stored per-hash, so raising them later doesn't invalidate
 * existing passwords.
 */
@Injectable()
export class PasswordService {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(SALT_LENGTH);
    const derived = await scryptAsync(password.normalize('NFKC'), salt, KEY_LENGTH, PARAMS);

    return [
      'scrypt',
      PARAMS.N,
      PARAMS.r,
      PARAMS.p,
      salt.toString('base64'),
      derived.toString('base64'),
    ].join('$');
  }

  async verify(password: string, stored: string): Promise<boolean> {
    const [scheme, n, r, p, saltB64, hashB64] = stored.split('$');

    if (scheme !== 'scrypt' || !saltB64 || !hashB64) {
      return false;
    }

    const expected = Buffer.from(hashB64, 'base64');
    const derived = await scryptAsync(password.normalize('NFKC'), Buffer.from(saltB64, 'base64'), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: PARAMS.maxmem,
    });

    // Constant-time: a plain === leaks how much of the hash matched.
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  }
}
