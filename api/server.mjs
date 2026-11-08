let application;

export default async function handler(request, response) {
  try {
    // Load the JavaScript produced by the server build, so the deployed
    // function never depends on resolving source .ts files as .js at runtime.
    application ??= import('../dist-server/server/app.js').then(({ buildApp }) => buildApp({ serverless: true }));
    const app = await application;
    await app.ready();
    app.server.emit('request', request, response);
  } catch (error) {
    // Codes identify packaging/configuration problems without logging secrets.
    console.error('API initialization failed', {
      name: error instanceof Error ? error.name : 'UnknownError',
      code: error && typeof error === 'object' && 'code' in error ? error.code : undefined,
    });
    response.statusCode = 503;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.end(JSON.stringify({ error: 'Сервер временно недоступен. Проверьте настройки базы данных.' }));
  }
}
