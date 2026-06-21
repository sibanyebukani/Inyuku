import * as Sentry from '@sentry/node';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

let sentryInitialized = false;
let otelSdk: NodeSDK | undefined;

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.GIT_COMMIT_SHA,
    tracesSampleRate: 0.1,
  });
  sentryInitialized = true;
}

export function initOpenTelemetry(): void {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) return;

  otelSdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter({ url: endpoint }),
    instrumentations: [getNodeAutoInstrumentations()],
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: 'inyuku-api',
      [ATTR_SERVICE_VERSION]: process.env.GIT_COMMIT_SHA ?? 'dev',
    }),
  });
  otelSdk.start();
}

export function isSentryInitialized(): boolean {
  return sentryInitialized;
}

export { Sentry };

export function shutdownObservability(): Promise<void> {
  return otelSdk?.shutdown() ?? Promise.resolve();
}
