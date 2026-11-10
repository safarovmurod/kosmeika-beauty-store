import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';

const root = 'assets-source/catalog-import-20261110';
const input = 'work/catalog-import-20261110/cutouts';
await mkdir(`${root}/png`, { recursive: true });
await mkdir(`${root}/webp`, { recursive: true });
const manifest = [];
for (const name of (await readdir(input)).filter((name) => name.endsWith('.png')).sort()) {
  const key = name.replace(/^photo-/, '').replace(/\.png$/, '');
  const source = await readFile(`${input}/${name}`);
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  // Remove detached mask dust, keeping the pixels and labels of the product.
  const count = info.width * info.height;
  const labels = new Int32Array(count);
  const queue = new Int32Array(count);
  const areas = [0];
  for (let start = 0; start < count; start++) {
    if (labels[start] || data[start * 4 + 3] <= 8) continue;
    const label = areas.length;
    let head = 0, tail = 1;
    queue[0] = start; labels[start] = label;
    while (head < tail) {
      const p = queue[head++], x = p % info.width, y = Math.floor(p / info.width);
      for (const next of [x > 0 ? p - 1 : -1, x + 1 < info.width ? p + 1 : -1, y > 0 ? p - info.width : -1, y + 1 < info.height ? p + info.width : -1]) {
        if (next >= 0 && !labels[next] && data[next * 4 + 3] > 8) { labels[next] = label; queue[tail++] = next; }
      }
    }
    areas.push(tail);
  }
  const minimum = Math.max(128, Math.floor(Math.max(...areas) * 0.002));
  let left = info.width, top = info.height, right = -1, bottom = -1;
  for (let p = 0; p < count; p++) {
    if (!labels[p] || areas[labels[p]] < minimum) { data[p * 4 + 3] = 0; continue; }
    const x = p % info.width, y = Math.floor(p / info.width);
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  if (right < left) throw new Error(`Empty photo ${key}`);
  const object = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract({ left, top, width: right - left + 1, height: bottom - top + 1 })
    .resize({ width: 880, height: 1056, fit: 'inside' }).png().toBuffer();
  const size = await sharp(object).metadata();
  const png = await sharp({ create: { width: 1000, height: 1200, channels: 4, background: '#00000000' } })
    .composite([{ input: object, left: Math.floor((1000 - size.width) / 2), top: Math.floor((1200 - size.height) / 2) }]).png().toBuffer();
  const digest = createHash('sha256').update(png).digest('hex');
  const hash = createHash('sha256').update(`catalog-20261110:${key}:${digest}`).digest('hex');
  const imageId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
  const file = `${root}/webp/photo-${key}.webp`;
  const thumbnail = `${root}/webp/photo-${key}-thumb.webp`;
  await writeFile(`${root}/png/photo-${key}.png`, png);
  await sharp(png).webp({ lossless: true, effort: 3 }).toFile(file);
  await sharp(png).resize(480).webp({ quality: 90, alphaQuality: 100, effort: 3 }).toFile(thumbnail);
  manifest.push({ key, imageId, file, thumbnail, png: `${root}/png/photo-${key}.png`, sha256: digest, url: `/uploads/${imageId}.webp`, width: 1000, height: 1200 });
}
if (manifest.length !== 26) throw new Error(`Expected 26 prepared photos, got ${manifest.length}`);
await writeFile(`${root}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ photos: manifest.length, format: '1000x1200 transparent PNG + WebP' }));
