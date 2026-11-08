import sharp from 'sharp';
await sharp('assets-source/hero.png').resize({width:1600,withoutEnlargement:true}).webp({quality:82}).toFile('public/images/hero.webp');
await import('./optimize-catalog-photos.mjs');
