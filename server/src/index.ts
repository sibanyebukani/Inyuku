import Fastify from 'fastify';

const app = Fastify({ logger: true });

app.get('/health', async () => ({ ok: true, data: { status: 'ok' } }));

const port = Number(process.env.PORT ?? 8080);
app.listen({ port, host: '0.0.0.0' }).then(() => {
  app.log.info(`api on :${port}`);
});
