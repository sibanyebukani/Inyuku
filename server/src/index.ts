import { buildApp } from './app.js';
import { initSentry, initOpenTelemetry, shutdownObservability } from './observability.js';

initSentry();
initOpenTelemetry();

const app = buildApp();

const port = Number(process.env.PORT ?? 8080);
app.listen({ port, host: '0.0.0.0' }).then(() => {
  app.log.info(`api on :${port}`);
});

async function shutdown(signal: string) {
  app.log.info(`received ${signal}, shutting down`);
  await app.close();
  await shutdownObservability();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
