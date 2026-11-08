import type { IncomingMessage, ServerResponse } from 'node:http';
import type { buildApp } from '../server/app.js';

let application: ReturnType<typeof buildApp> | undefined;

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  try {
    application ??= import('../server/app.js').then(({ buildApp }) => buildApp({ serverless: true }));
    const app = await application;
    await app.ready();
    app.server.emit('request', request, response);
  } catch {
    // Do not expose connection strings, driver errors or server paths.
    response.statusCode = 503;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.end(JSON.stringify({ error: 'Сервер временно недоступен. Проверьте настройки базы данных.' }));
  }
}
