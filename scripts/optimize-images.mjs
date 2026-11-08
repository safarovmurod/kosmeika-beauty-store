import sharp from 'sharp';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

const source = 'assets-source/products';
const directory = 'public/images/products';
for (const name of await readdir(source)) {
  if (!/^product_\d+\.png$/.test(name)) continue;
  const input = path.join(source, name);
  const base = path.join(directory, name.replace(/\.png$/, ''));
  await sharp(input).rotate().resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toFile(`${base}.webp`);
  await sharp(input).rotate().resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toFile(`${base}-thumb.webp`);
}
await sharp('assets-source/hero.png').resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 82 }).toFile('public/images/hero.webp');
