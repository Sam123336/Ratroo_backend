import { readFileSync } from 'fs';
import { resolve } from 'path';

export interface WorkerConfig {
  redisUrl?: string;
  apiBaseUrl: string;
  internalApiKey?: string;
}

export function loadWorkerConfig(): WorkerConfig {
  loadEnvFile(resolve(process.cwd(), '../../.env'));
  loadEnvFile(resolve(process.cwd(), '.env'));

  return {
    redisUrl: process.env.REDIS_URL,
    apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:3000',
    internalApiKey: process.env.INTERNAL_INGESTION_API_KEY,
  };
}

export function assertWorkerConfig(config: WorkerConfig): asserts config is Required<WorkerConfig> {
  const missing = [];

  if (!config.redisUrl) {
    missing.push('REDIS_URL');
  }
  if (!config.internalApiKey) {
    missing.push('INTERNAL_INGESTION_API_KEY');
  }

  if (missing.length) {
    throw new Error(`Worker configuration is incomplete. Missing: ${missing.join(', ')}`);
  }
}

function loadEnvFile(path: string) {
  try {
    const body = readFileSync(path, 'utf8');
    for (const line of body.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      const separator = trimmed.indexOf('=');
      if (separator <= 0) {
        continue;
      }
      const key = trimmed.slice(0, separator).trim();
      const rawValue = trimmed.slice(separator + 1).trim();
      if (!process.env[key]) {
        process.env[key] = rawValue.replace(/^['"]|['"]$/g, '');
      }
    }
  } catch {
    // Optional env files are intentionally ignored.
  }
}
