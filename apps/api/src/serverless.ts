import type { IncomingMessage, ServerResponse } from 'http';
import { createApp } from './setup';

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

/**
 * Serverless entry (Vercel). The app is built once per warm instance and reused, so only a cold start
 * pays for it. api/index.js re-exports this.
 */
let ready: Promise<Handler> | undefined;

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
) {
  ready ??= createApp()
    .then(async (app) => {
      await app.init();
      return app.getHttpAdapter().getInstance() as Handler;
    })
    .catch((e: unknown) => {
      ready = undefined; // let the next request try again
      throw e;
    });
  (await ready)(req, res);
}
