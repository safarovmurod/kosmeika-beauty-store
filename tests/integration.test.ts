import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { createServer } from 'node:http';
import EmbeddedPostgres from 'embedded-postgres';
import argon2 from 'argon2';
import sharp from 'sharp';

test('real PostgreSQL: owner login, protected writes, durable uploads and analytics', { timeout: 180000 }, async (t) => {
  const root = path.resolve('.test-postgres');
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(path.join(root, 'run-'));
  const socket = net.createServer();
  await new Promise<void>((resolve) => socket.listen(0, '127.0.0.1', resolve));
  const address = socket.address();
  if (!address || typeof address === 'string') throw new Error('No test port');
  const port = address.port;
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  const databasePassword = randomBytes(24).toString('hex');
  const database = new EmbeddedPostgres({ databaseDir: directory, user: 'postgres', password: databasePassword, port, persistent: false, autoRehydrateSymlinks: true, postgresFlags: ['-h', '127.0.0.1'], initdbFlags: ['--locale=C', '--encoding=UTF8'], onLog: () => {}, onError: () => {} });
  await database.initialise();
  await database.start();
  try {
    await database.createDatabase('beauty_test');
    process.env.DATABASE_URL = `postgresql://postgres:${databasePassword}@127.0.0.1:${port}/beauty_test`;
    process.env.DATABASE_URL_UNPOOLED = process.env.DATABASE_URL;
    process.env.PUBLIC_ORIGIN = 'https://store.example';
    process.env.NODE_ENV = 'production';
    await promisify(execFile)(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env: process.env });
    const { db } = await import('../server/db.js');
    const { buildApp } = await import('../server/app.js');
    const { OWNER_EMAIL } = await import('../server/owner.js');
    const password = randomBytes(24).toString('base64url');
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await db.admin.create({ data: { email: OWNER_EMAIL, passwordHash } });
    await db.admin.create({ data: { email: 'other@example.com', passwordHash } });
    let app = await buildApp({ serverless: true, logger: false });
    await app.ready();
    const origin = { origin: process.env.PUBLIC_ORIGIN };
    try {
      await t.test('anonymous API and cross-origin mutations are rejected', async () => {
        for (const url of ['/api/admin/products', '/api/admin/categories', '/api/admin/stats', '/api/admin/session']) {
          const response = await app.inject({ url });
          assert.equal(response.statusCode, 401, url);
          assert.equal(response.headers['cache-control'], 'no-store');
        }
        assert.ok([401, 404].includes((await app.inject({ url: '/api/%61dmin/products' })).statusCode));
        const response = await app.inject({ method: 'POST', url: '/api/admin/login', headers: { origin: 'https://attacker.example' }, payload: { email: OWNER_EMAIL, password } });
        assert.equal(response.statusCode, 403);
      });
      const login = (email: string, value: string) => app.inject({ method: 'POST', url: '/api/admin/login', headers: origin, payload: { email, password: value } });
      await t.test('only the configured owner with the right password can enter', async () => {
        assert.equal((await login(OWNER_EMAIL, 'wrong-password')).statusCode, 401);
        assert.equal((await login('other@example.com', password)).statusCode, 401);
      });
      const response = await login(OWNER_EMAIL, password);
      assert.equal(response.statusCode, 200);
      const cookieHeader = String(response.headers['set-cookie']);
      assert.match(cookieHeader, /HttpOnly/i); assert.match(cookieHeader, /Secure/i); assert.match(cookieHeader, /SameSite=Strict/i);
      const cookie = cookieHeader.split(';')[0];
      const auth = { ...origin, cookie };
      const secondDevice = await login(OWNER_EMAIL, password);
      assert.equal(secondDevice.statusCode, 200);
      assert.notEqual(String(secondDevice.headers['set-cookie']).split(';')[0], cookie);
      const categoryResponse = await app.inject({ method: 'POST', url: '/api/admin/categories', headers: auth, payload: { name: 'Test category' } });
      assert.equal(categoryResponse.statusCode, 200);
      const categoryId = categoryResponse.json().id as string;
      let photoUrl = '';
      await t.test('uploads are decoded, stored persistently and served as WebP', async () => {
        const data = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#a75a6c' } }).png().toBuffer();
        const boundary = randomUUID();
        const upload = (image: Buffer) => app.inject({ method: 'POST', url: '/api/admin/upload', headers: { ...auth, 'content-type': `multipart/form-data; boundary=${boundary}` }, payload: Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.png"\r\nContent-Type: image/png\r\n\r\n`), image, Buffer.from(`\r\n--${boundary}--\r\n`)]) });
        const invalid = await upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'));
        assert.equal(invalid.statusCode, 400);
        const result = await upload(data);
        assert.equal(result.statusCode, 200);
        photoUrl = result.json().url as string;
        const photo = await app.inject({ url: photoUrl });
        assert.equal(photo.statusCode, 200); assert.match(String(photo.headers['content-type']), /image\/webp/);
        assert.equal((await sharp(photo.rawPayload).metadata()).format, 'webp');
        assert.equal((await app.inject({ url: photoUrl.replace('.webp', '-thumb.webp') })).statusCode, 200);
        assert.equal((await app.inject({ url: '/uploads/invalid.webp' })).statusCode, 404);
        assert.equal(await db.image.count(), 1);
        assert.equal((await upload(Buffer.alloc(4 * 1024 * 1024 + 1))).statusCode, 413);
      });
      const draft = { name: 'Test product', description: 'Test only', usage: '', ingredients: '', volume: '', categoryId, price: 12000, salePrice: null, available: true, visible: true, isNew: false, recommended: false, position: 1, variants: [{ id: 'rose', name: 'Rose', color: '#a75a6c', sku: 'test-rose', available: true, price: null, images: [photoUrl] }, { id: 'nude', name: 'Nude', color: '#c3947c', sku: 'test-nude', available: true, price: 15000, images: [photoUrl] }] };
      const created = await app.inject({ method: 'POST', url: '/api/admin/products', headers: auth, payload: draft });
      assert.equal(created.statusCode, 200);
      const productId = created.json().id as string;
      await t.test('catalog changes and files survive a new function instance', async () => {
        await app.close(); app = await buildApp({ serverless: true, logger: false }); await app.ready();
        assert.equal((await app.inject({ url: '/api/admin/session', headers: { cookie } })).statusCode, 200);
        const items = (await app.inject({ url: '/api/catalog' })).json().products;
        assert.equal(items.length, 1); assert.equal(items[0].variants[1].price, 15000);
        assert.equal((await app.inject({ url: photoUrl })).statusCode, 200);
        const update = await app.inject({ method: 'PUT', url: `/api/admin/products/${productId}`, headers: auth, payload: { ...draft, visible: false } });
        assert.equal(update.statusCode, 200);
        assert.equal((await app.inject({ url: '/api/catalog' })).json().products.length, 0);
      });
      await t.test('analytics deduplicates event IDs and excludes the owner', async () => {
        const event = { id: randomUUID(), type: 'whatsapp', productId, variantId: 'nude' };
        for (let i = 0; i < 2; i++) assert.equal((await app.inject({ method: 'POST', url: '/api/events', headers: origin, payload: event })).statusCode, 204);
        await app.inject({ method: 'POST', url: '/api/events', headers: auth, payload: { ...event, id: randomUUID() } });
        assert.equal(await db.event.count(), 1);
        assert.equal((await db.event.findFirst())?.type, 'whatsapp');
      });
      await t.test('logout and password replacement revoke access', async () => {
        assert.equal((await app.inject({ method: 'POST', url: '/api/admin/logout', headers: auth, payload: {} })).statusCode, 200);
        assert.equal((await app.inject({ url: '/api/admin/session', headers: { cookie } })).statusCode, 401);
        const nextCookie = String(secondDevice.headers['set-cookie']).split(';')[0];
        const admin = await db.admin.findUniqueOrThrow({ where: { email: OWNER_EMAIL } });
        await db.$transaction([db.admin.update({ where: { id: admin.id }, data: { passwordHash: await argon2.hash(randomBytes(24).toString('hex')) } }), db.session.deleteMany({ where: { adminId: admin.id } })]);
        assert.equal((await app.inject({ url: '/api/admin/session', headers: { cookie: nextCookie } })).statusCode, 401);
      });
      await t.test('a new function instance does not reset the login limit', async () => {
        await db.loginWindow.updateMany({ data: { count: 12 } });
        await app.close(); app = await buildApp({ serverless: true, logger: false }); await app.ready();
        const limited = await login(OWNER_EMAIL, 'wrong-password');
        assert.equal(limited.statusCode, 429);
        assert.ok(Number(limited.headers['retry-after']) > 0);
      });
      await t.test('Vercel entrypoint forwards raw HTTP requests to Fastify', async () => {
        const handler = (await import('../api/server.js')).default;
        const server = createServer(handler);
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('No HTTP test port');
        try {
          const base = `http://127.0.0.1:${address.port}`;
          const health = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(10000) });
          assert.equal(health.status, 200); assert.deepEqual(await health.json(), { ok: true });
          const anonymous = await fetch(`${base}/api/admin/products`, { signal: AbortSignal.timeout(10000) });
          assert.equal(anonymous.status, 401);
          const post = await fetch(`${base}/api/admin/login`, { method: 'POST', headers: { origin: process.env.PUBLIC_ORIGIN!, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: OWNER_EMAIL, password: 'invalid-password' }), signal: AbortSignal.timeout(10000) });
          assert.equal(post.status, 429);
        } finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
      });
    } finally { await app.close(); await db.$disconnect(); }
  } finally { await database.stop(); }
});
