import 'dotenv/config';
import argon2 from 'argon2';
import { db } from './db.js';
import { OWNER_EMAIL } from './owner.js';
import { readPassword } from './password-prompt.js';

async function main() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Откройте create-admin.cmd двойным щелчком в папке проекта.');
  console.log('Создание администратора магазина');
  console.log(`Логин: ${OWNER_EMAIL}`);
  console.log('При вводе пароля видны только звёздочки. Для отмены: Ctrl+C.');
  const exists = await db.admin.findUnique({ where: { email: OWNER_EMAIL } });
  const reset = process.argv.includes('--reset');
  if (exists && !reset) { console.log('Администратор уже существует. Войдите на https://kosmeika-beauty-store.vercel.app/admin со своим паролем.'); return; }
  if (!exists && reset) throw new Error('Администратор не найден. Запустите создание без --reset.');

  let first: string;
  for (;;) {
    first = await readPassword('Новый пароль (минимум 12 символов): ');
    if (first.length < 12) { console.log('Слишком короткий пароль. Нужно минимум 12 символов. Попробуйте ещё раз.'); continue; }
    const second = await readPassword('Повторите пароль: ');
    if (first !== second) { console.log('Пароли не совпадают. Введите новый пароль ещё раз.'); continue; }
    break;
  }
  const passwordHash = await argon2.hash(first, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  if (exists) {
    await db.$transaction([
      db.admin.update({ where: { id: exists.id }, data: { passwordHash } }),
      db.session.deleteMany({ where: { adminId: exists.id } }),
      db.audit.create({ data: { action: 'admin.password_reset' } }),
    ]);
    console.log('Пароль изменён, все сессии отозваны.');
  } else {
    await db.admin.create({ data: { email: OWNER_EMAIL, passwordHash } });
    console.log('Администратор создан.');
  }
  console.log('Теперь откройте https://kosmeika-beauty-store.vercel.app/admin и войдите.');
}

try { await main(); }
catch (error) {
  const message = error instanceof Error && error.constructor === Error && !('code' in error) ? error.message : 'Не удалось подключиться к базе или сохранить аккаунт. Проверьте подключение к интернету и настройки .env.';
  console.error(message); process.exitCode = 1;
} finally { await db.$disconnect(); }
