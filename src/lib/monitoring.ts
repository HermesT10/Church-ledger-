import * as Sentry from '@sentry/nextjs';
import { logger, serializeError } from '@/lib/logger';
import { getRequestContext } from '@/lib/request-context';

interface FailureLogParams {
  area: string;
  event: string;
  error: unknown;
  metadata?: Record<string, unknown>;
  capture?: boolean;
}

export async function logServerFailure(params: FailureLogParams): Promise<void> {
  const context = await getRequestContext();
  const serialized = serializeError(params.error);
  const payload = {
    area: params.area,
    event: params.event,
    requestId: context.requestId,
    pathname: context.pathname,
    demoMode: context.demoMode,
    metadata: params.metadata,
    error: serialized,
  };

  logger.error(payload, `${params.area}.${params.event} failed`);

  if (params.capture !== false) {
    Sentry.withScope((scope) => {
      scope.setTag('area', params.area);
      scope.setTag('event', params.event);

      if (context.requestId) {
        scope.setTag('request_id', context.requestId);
      }
      if (context.pathname) {
        scope.setTag('pathname', context.pathname);
      }
      if (params.metadata) {
        scope.setContext('metadata', params.metadata);
      }

      scope.setContext('request', {
        requestId: context.requestId,
        pathname: context.pathname,
        demoMode: context.demoMode,
      });

      Sentry.captureException(
        params.error instanceof Error
          ? params.error
          : new Error(serialized.message as string),
      );
    });
  }
}

export async function logServerEvent(params: {
  area: string;
  event: string;
  level?: 'info' | 'warn';
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const context = await getRequestContext();
  const payload = {
    area: params.area,
    event: params.event,
    requestId: context.requestId,
    pathname: context.pathname,
    demoMode: context.demoMode,
    metadata: params.metadata,
  };

  if (params.level === 'warn') {
    logger.warn(payload, `${params.area}.${params.event}`);
    return;
  }

  logger.info(payload, `${params.area}.${params.event}`);
}
