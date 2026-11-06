import { createApp } from './setup';

async function bootstrap() {
  const app = await createApp();
  app.enableShutdownHooks(); // close database connections cleanly on SIGTERM
  await app.listen(process.env.PORT ?? 4000);
}
void bootstrap();
