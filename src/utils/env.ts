import fs from 'fs';
import path from 'path';
import { logger } from './logger';

const ENV_LOADED = Symbol.for('CRAWL_SERVICE_ENV_LOADED');

export function loadEnv() {
  if ((global as Record<symbol, boolean>)[ENV_LOADED]) {
    return;
  }

  const envFile = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envFile)) {
    const content = fs.readFileSync(envFile, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [key, ...rest] = trimmed.split('=');
      const value = rest.join('=').trim();
      if (key && !(key in process.env)) {
        process.env[key] = value;
      }
    }
    logger.info('Environment variables loaded from .env');
  }

  (global as Record<symbol, boolean>)[ENV_LOADED] = true;
}
