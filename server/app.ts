import 'dotenv/config';
import Fastify, { type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { randomBytes, createHash, createHmac, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import argon2 from 'argon2';
import sharp from 'sharp';
import { z } from 'zod';
import { db } from './db.js';
import { productSchema } from '../shared/schema.js';
import { OWNER_EMAIL } from './owner.js';

export async function buildApp(options: { serverless?: boolean; logger?: boolean } = {}) {
  const app = Fastify({ logger: options.logger ?? true, bodyLimit: 1024 * 1024, trustProxy: false });
  const production = process.env.NODE_ENV === 'production' || options.serverless === true;
  const origin = process.env.PUBLIC_ORIGIN || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined);
  if (!origin || (production && !origin.startsWith('https://'))) throw new Error('PUBLIC_ORIGIN must be set (HTTPS in production)');
  const uploads = path.resolve(process.env.UPLOAD_DIR || './uploads');
  if (!options.serverless) await mkdir(uploads, { recursive: true });
  await app.register(cookie);
  await app.register(helmet, { contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], imgSrc: ["'self'", 'data:'], styleSrc: ["'self'", "'unsafe-inline'"], scriptSrc: ["'self'"], connectSrc: ["'self'"], objectSrc: ["'none'"], baseUri: ["'self'"], frameAncestors: ["'none'"] } } });
  function clientAddress(request: FastifyRequest) {
    const forwarded = process.env.VERCEL === '1' && options.serverless ? request.headers['x-vercel-forwarded-for'] : undefined;
    return typeof forwarded === 'string' && isIP(forwarded) ? forwarded : request.ip;
  }
  await app.register(rateLimit, { global: false, keyGenerator: clientAddress });
  await app.register(multipart, { limits: { fileSize: (options.serverless ? 4 : 8) * 1024 * 1024, files: 1 } });
  if (!options.serverless) {
    await app.register(fastifyStatic, { root: uploads, prefix: '/uploads/', decorateReply: false, setHeaders: (response) => { response.header('X-Content-Type-Options', 'nosniff'); response.header('Content-Disposition', 'inline'); } });
  }
  if (options.serverless) {
    app.get<{ Params: { file: string } }>('/uploads/:file', async (request, reply) => {
      const name = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(-thumb)?\.webp$/.exec(request.params.file);
      if (!name) return reply.code(404).send({ error: 'Фото не найдено' });
      const image = await db.image.findUnique({ where: { id: name[1] } });
      if (!image) return reply.code(404).send({ error: 'Фото не найдено' });
      return reply.type('image/webp').header('X-Content-Type-Options', 'nosniff').header('Cache-Control', 'public, max-age=31536000, immutable').send(Buffer.from(name[2] ? image.thumbnail : image.content));
    });
  }
  const hash = (value: string) => createHash('sha256').update(value).digest('hex');
  const dummyHash = await argon2.hash(randomBytes(24).toString('hex'), { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const getSession = async (token?: string) => token ? db.session.findFirst({ where: { id: hash(token), expiresAt: { gt: new Date() } } }) : null;
  app.addHook('preHandler', async (request, reply) => {
    const route = request.routeOptions.url || '';
    if (route.startsWith('/api/admin')) reply.header('Cache-Control', 'no-store');
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) && request.headers.origin !== origin) return reply.code(403).send({ error: 'Недопустимый источник запроса' });
    if (route.startsWith('/api/admin') && route !== '/api/admin/login') {
      if (!await getSession(request.cookies.session)) return reply.code(401).send({ error: 'Требуется вход' });
    }
  });
  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    const status = typeof error === 'object' && error !== null && 'statusCode' in error ? error.statusCode : undefined;
    const code = typeof status === 'number' && status < 500 ? status : 500;
    reply.code(code).send({ error: code === 500 ? 'Ошибка сервера' : 'Некорректный запрос' });
  });
  app.get('/api/health', async (_request, reply) => {
    try { await db.$queryRaw`SELECT 1`; return { ok: true }; } catch { return reply.code(503).send({ ok: false }); }
  });
  app.get('/api/catalog', async () => ({
    categories: await db.category.findMany({ orderBy: { position: 'asc' } }),
    products: await db.product.findMany({ where: { visible: true }, include: { category: true }, orderBy: [{ position: 'asc' }, { createdAt: 'desc' }] }),
    brand: (await db.setting.findUnique({ where: { key: 'brand' } }))?.value || 'Lumière',
  }));
  app.post('/api/events', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    if (await getSession(request.cookies.session) || /bot|crawler|spider/i.test(request.headers['user-agent'] || '')) return reply.code(204).send();
    const result = z.object({ id: z.string().uuid(), type: z.enum(['view', 'product', 'whatsapp']), productId: z.string().max(100).optional(), variantId: z.string().max(100).optional() }).safeParse(request.body);
    if (!result.success) return reply.code(400).send({ error: 'Некорректное событие' });
    await db.event.upsert({ where: { id: result.data.id }, update: {}, create: result.data });
    return reply.code(204).send();
  });
  app.post('/api/admin/login', { config: { rateLimit: { max: 12, timeWindow: '15 minutes' } } }, async (request, reply) => {
    // Vercel sets this header at its edge. Other hosts use the actual socket IP.
    const address = clientAddress(request);
    const window = Math.floor(Date.now() / (15 * 60 * 1000));
    const key = createHmac('sha256', process.env.DATABASE_URL!).update(`${address}:${window}`).digest('hex');
    const expiresAt = new Date((window + 1) * 15 * 60 * 1000);
    const [attempt] = await db.$queryRaw<{ count: number }[]>`INSERT INTO "LoginWindow" ("id", "count", "expiresAt") VALUES (${key}, 1, ${expiresAt}) ON CONFLICT ("id") DO UPDATE SET "count" = LEAST("LoginWindow"."count" + 1, 13) RETURNING "count"`;
    if (attempt.count > 12) return reply.code(429).header('Retry-After', String(Math.ceil((expiresAt.getTime() - Date.now()) / 1000))).send({ error: 'Слишком много попыток. Попробуйте позже.' });
    if (attempt.count > 1) await new Promise((resolve) => setTimeout(resolve, Math.min(2000, 150 * 2 ** Math.min(attempt.count - 1, 4))));
    const input = z.object({ email: z.string().email().max(254), password: z.string().max(1024) }).safeParse(request.body);
    const admin = input.success && input.data.email.toLowerCase() === OWNER_EMAIL ? await db.admin.findUnique({ where: { email: OWNER_EMAIL } }) : null;
    const valid = await argon2.verify(admin?.passwordHash || dummyHash, input.success ? input.data.password : 'invalid');
    if (!admin || !valid) {
      return reply.code(401).send({ error: 'Неверный логин или пароль' });
    }
    if (request.cookies.session) await db.session.deleteMany({ where: { id: hash(request.cookies.session) } });
    const token = randomBytes(32).toString('base64url');
    await db.session.create({ data: { id: hash(token), adminId: admin.id, expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000) } });
    reply.setCookie('session', token, { httpOnly: true, secure: production, sameSite: 'strict', path: '/', maxAge: 8 * 60 * 60 });
    return { ok: true };
  });
  app.get('/api/admin/session', async () => ({ ok: true }));
  app.post('/api/admin/logout', async (request, reply) => {
    if (request.cookies.session) await db.session.deleteMany({ where: { id: hash(request.cookies.session) } });
    reply.clearCookie('session', { path: '/' }); return { ok: true };
  });
  app.get('/api/admin/products', async () => db.product.findMany({ include: { category: true }, orderBy: { position: 'asc' } }));
  app.get('/api/admin/categories', async () => db.category.findMany({ orderBy: { position: 'asc' } }));
  app.post('/api/admin/categories', async (request, reply) => {
    const parsed = z.object({ name: z.string().trim().min(1).max(100) }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Укажите название категории' });
    const category = await db.category.create({ data: parsed.data }); await db.audit.create({ data: { action: 'category.create' } }); return category;
  });
  app.delete<{ Params: { id: string } }>('/api/admin/categories/:id', async (request, reply) => {
    if (await db.product.count({ where: { categoryId: request.params.id } })) return reply.code(409).send({ error: 'В категории есть товары' });
    await db.category.delete({ where: { id: request.params.id } }); await db.audit.create({ data: { action: 'category.delete' } }); return { ok: true };
  });
  app.post('/api/admin/products', async (request, reply) => {
    const parsed = productSchema.safeParse(request.body); if (!parsed.success) return reply.code(400).send({ error: 'Проверьте поля товара', details: parsed.error.issues });
    const product = await db.product.create({ data: parsed.data }); await db.audit.create({ data: { action: 'product.create' } }); return product;
  });
  app.put<{ Params: { id: string } }>('/api/admin/products/:id', async (request, reply) => {
    const parsed = productSchema.safeParse(request.body); if (!parsed.success) return reply.code(400).send({ error: 'Проверьте поля товара', details: parsed.error.issues });
    const product = await db.product.update({ where: { id: request.params.id }, data: parsed.data }); await db.audit.create({ data: { action: 'product.update' } }); return product;
  });
  app.delete<{ Params: { id: string } }>('/api/admin/products/:id', async (request) => {
    await db.product.delete({ where: { id: request.params.id } }); await db.audit.create({ data: { action: 'product.delete' } }); return { ok: true };
  });
  app.post('/api/admin/upload', async (request, reply) => {
    const file = await request.file(); if (!file) return reply.code(400).send({ error: 'Выберите изображение' });
    const buffer = await file.toBuffer();
    try {
      const input = sharp(buffer, { limitInputPixels: 40_000_000, failOn: 'error' }); const metadata = await input.metadata();
      if (!['jpeg', 'png', 'webp'].includes(metadata.format || '')) return reply.code(400).send({ error: 'Разрешены JPEG, PNG и WebP' });
      const id = randomUUID(); const name = `${id}.webp`;
      const image = await input.clone().rotate().resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
      const thumbnail = await input.clone().rotate().resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
      if (options.serverless) {
        if (image.length > 4 * 1024 * 1024) return reply.code(400).send({ error: 'После обработки изображение слишком большое' });
        await db.image.create({ data: { id, content: image, thumbnail } });
      } else {
        await writeFile(path.join(uploads, name), image);
        await writeFile(path.join(uploads, `${id}-thumb.webp`), thumbnail);
      }
      await db.audit.create({ data: { action: 'image.upload' } }); return { url: `/uploads/${name}` };
    } catch { return reply.code(400).send({ error: 'Не удалось прочитать изображение' }); }
  });
  app.get('/api/admin/stats', async (request, reply) => {
    const parsed = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'Укажите период' });
    const from = new Date(`${parsed.data.from}T00:00:00+05:00`); const to = new Date(`${parsed.data.to}T23:59:59.999+05:00`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to || to.getTime() - from.getTime() > 366 * 86400000) return reply.code(400).send({ error: 'Некорректный период' });
    return db.event.findMany({ where: { createdAt: { gte: from, lte: to } }, select: { type: true, productId: true, variantId: true, createdAt: true }, take: 100000, orderBy: { createdAt: 'desc' } });
  });
  app.put('/api/admin/settings', async (request, reply) => {
    const parsed = z.object({ brand: z.string().trim().min(1).max(80) }).safeParse(request.body); if (!parsed.success) return reply.code(400).send({ error: 'Укажите название' });
    await db.setting.upsert({ where: { key: 'brand' }, create: { key: 'brand', value: parsed.data.brand }, update: { value: parsed.data.brand } });
    await db.audit.create({ data: { action: 'settings.update' } }); return { ok: true };
  });
  if (production) {
    const escapeHtml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
    app.get('/robots.txt', async (_request, reply) => reply.type('text/plain').send(`User-agent: *\nDisallow: /admin\nSitemap: ${origin}/sitemap.xml\n`));
    app.get('/sitemap.xml', async (_request, reply) => {
      const products = await db.product.findMany({ where: { visible: true }, select: { id: true, variants: true } });
      const urls = [origin, ...products.map((p) => `${origin}/?product=${encodeURIComponent(p.id)}`)];
      return reply.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((url) => `<url><loc>${escapeHtml(url)}</loc></url>`).join('')}</urlset>`);
    });
    app.get('/', async (request, reply) => {
      const query = z.object({ product: z.string().max(100).optional(), variant: z.string().max(100).optional() }).safeParse(request.query);
      const product = query.success && query.data.product ? await db.product.findFirst({ where: { id: query.data.product, visible: true } }) : null;
      let html = await readFile(path.resolve('dist/index.html'), 'utf8');
      if (product && query.success) {
        const variants = z.array(productSchema.shape.variants.element).safeParse(product.variants);
        const selected = variants.success ? variants.data.find((v) => v.id === query.data.variant) || variants.data[0] : null;
        const title = escapeHtml(product.name); const description = escapeHtml(product.description.slice(0, 180) || 'Каталог косметики');
        html = html.replace(/<title>.*?<\/title>/, `<title>${title}</title>`).replace(/<meta property="og:title" content="[^"]*"\s*\/>/, `<meta property="og:title" content="${title}"/>`).replace(/<meta property="og:description" content="[^"]*"\s*\/>/, `<meta property="og:description" content="${description}"/>`);
        if (selected?.images[0]) html = html.replace('</head>', `<meta property="og:image" content="${escapeHtml(new URL(selected.images[0], origin).href)}"/></head>`);
      }
      return reply.type('text/html').send(html);
    });
    if (!options.serverless) await app.register(fastifyStatic, { root: path.resolve('dist'), prefix: '/', decorateReply: false });
    app.setNotFoundHandler(async (request, reply) => {
      if (request.url.startsWith('/api/') || request.url.startsWith('/uploads/')) return reply.code(404).send({ error: 'Не найдено' });
      if (request.url.startsWith('/admin')) reply.header('X-Robots-Tag', 'noindex, nofollow');
      return reply.type('text/html').send(await readFile(path.resolve('dist/index.html')));
    });
  }
  return app;
}
