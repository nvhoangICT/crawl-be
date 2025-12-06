/* Simple structured logger helper so we can swap implementations later if needed */
class Logger {
  info(message: string, meta?: Record<string, unknown>) {
    console.log(`[INFO] ${new Date().toISOString()} - ${message}`, meta ?? '');
  }

  error(message: string, meta?: unknown) {
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, meta ?? '');
  }

  warn(message: string, meta?: Record<string, unknown>) {
    console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, meta ?? '');
  }
}

export const logger = new Logger();
