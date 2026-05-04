import pino from 'pino';
import { getLogLevel, getRuntimeMetadata } from '@/lib/env.server';

function buildBase() {
  const runtime = getRuntimeMetadata();
  return {
    app: 'church-ledger',
    env: runtime.appEnv,
    release: runtime.release ?? undefined,
  };
}

export const logger = pino({
  level: getLogLevel(),
  base: buildBase(),
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level(label) {
      return { level: label };
    },
  },
});

export function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    message: typeof error === 'string' ? error : 'Unknown error',
  };
}
