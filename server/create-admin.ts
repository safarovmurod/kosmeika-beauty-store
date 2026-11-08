import 'dotenv/config';
import { stdin, stdout } from 'node:process';
import argon2 from 'argon2';
import { db } from './db.js';
import { OWNER_EMAIL } from './owner.js';

const email = OWNER_EMAIL;
if (!stdin.isTTY) throw new Error('Запустите команду в интерактивном терминале.');
const exists = await db.admin.findUnique({ where: { email } });
const reset = process.argv.includes('--reset');
if (exists && !reset) throw new Error('Администратор уже существует; создание не меняет пароль. Для восстановления используйте --reset.');
if (!exists && reset) throw new Error('Администратор не найден; сначала создайте аккаунт без --reset.');
function password(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    stdout.write(prompt); let value = ''; stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8');
    function input(key: string) { if (key === '\u0003') process.exit(1); if (key === '\r' || key === '\n') { stdin.setRawMode(false); stdin.pause(); stdin.off('data', input); stdout.write('\n'); resolve(value); } else if (key === '\u007f' || key === '\b') value = value.slice(0, -1); else value += key; }
    stdin.on('data', input);
  });
}
const first = await password('Новый пароль (минимум 12 символов): ');
const second = await password('Повторите пароль: ');
if (first.length < 12 || first !== second) throw new Error('Пароли не совпадают или пароль короче 12 символов.');
const passwordHash = await argon2.hash(first, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
if (exists) {
  await db.$transaction([db.admin.update({ where: { id: exists.id }, data: { passwordHash } }), db.session.deleteMany({ where: { adminId: exists.id } }), db.audit.create({ data: { action: 'admin.password_reset' } })]);
  console.log('Пароль изменён, все сессии отозваны.');
} else {
  await db.admin.create({ data: { email, passwordHash } }); console.log('Администратор создан.');
}
await db.$disconnect();
