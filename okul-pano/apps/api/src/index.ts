import { buildApp } from './app.ts';

const app = await buildApp();
const { PORT, HOST } = app.deps.env;

try {
  await app.listen({ port: PORT, host: HOST });
  console.log(`Okul Pano API hazır: http://localhost:${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
}
