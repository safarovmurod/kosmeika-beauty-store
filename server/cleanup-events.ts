import { db } from './db.js';
const days = Number(process.env.EVENT_RETENTION_DAYS || 180);
if (!Number.isInteger(days) || days < 1 || days > 3650) throw new Error('EVENT_RETENTION_DAYS must be 1–3650');
const result = await db.event.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - days * 86400000) } } });
console.log(`Удалено старых событий: ${result.count}`);
await db.$disconnect();
