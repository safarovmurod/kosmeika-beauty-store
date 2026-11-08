import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

// User-provided cutouts: preserve all packaging pixels, only fit onto one frame.
const output = 'assets-source/catalog-import-20261108';
await mkdir(output, { recursive: true });
const sources = Array.from({ length: 13 }, (_, i) => ({ key: `photo-${String(i + 1).padStart(2, '0')}`, source: `work/catalog-import-20261108/new-photos/photo-${String(i + 1).padStart(2, '0')}.png` }));
sources.push({ key: 'air-jasmine', source: 'assets-source/catalog-import-20261108/air-jasmine.png' }, { key: 'restored-026', source: 'assets-source/products/product_026.png' });
const manifest = [];
for (const { key, source } of sources) {
  const buffer = await readFile(source);
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  const hash = createHash('sha256').update(`kosmeika-import-20261108:${key}:${sha256}`).digest('hex');
  const imageId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width, top = info.height, right = -1, bottom = -1;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 4 + 3] > 8) {
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  if (right < left) throw new Error(`Empty image: ${key}`);
  const foreground = await sharp(buffer).extract({ left, top, width: right - left + 1, height: bottom - top + 1 }).resize({ width: 880, height: 1056, fit: 'inside' }).png().toBuffer();
  const size = await sharp(foreground).metadata();
  const framed = sharp({ create: { width: 1000, height: 1200, channels: 4, background: '#00000000' } }).composite([{ input: foreground, left: Math.floor((1000 - size.width) / 2), top: Math.floor((1200 - size.height) / 2) }]);
  const file = `${output}/${key}.webp`, thumbnail = `${output}/${key}-thumb.webp`;
  const png = await framed.png().toBuffer();
  await sharp(png).webp({ lossless: true, effort: 3 }).toFile(file);
  await sharp(png).resize(480).webp({ quality: 90, alphaQuality: 100, effort: 3 }).toFile(thumbnail);
  manifest.push({ key, sourceSha256: sha256, imageId, file, thumbnail, url: `/uploads/${imageId}.webp`, sourceWidth: info.width, sourceHeight: info.height, width: 1000, height: 1200 });
}
await writeFile(`${output}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ exported: manifest.length, width: 1000, height: 1200 }));
