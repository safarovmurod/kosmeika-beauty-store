import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {db} from '../server/db.js';
import {variantSchema} from '../shared/schema.js';
import {z} from 'zod';

const apply=process.argv.includes('--apply');
const manifest=JSON.parse(await readFile('assets-source/catalog-v3/manifest.json','utf8')) as {number:number;needsFullPhoto:boolean}[];
if(manifest.length!==28||new Set(manifest.map(item=>item.number)).size!==28)throw new Error('Expected 28 distinct product photos');
try{
 const products=await db.product.findMany();
 await mkdir('work/backups',{recursive:true});
 await writeFile(`work/backups/photos-before-${Date.now()}.json`,JSON.stringify(products,null,2),{flag:'wx'});
 let updated=0;let skipped=0;
 await db.$transaction(async tx=>{
  for(const entry of manifest){
   const num=String(entry.number).padStart(3,'0');
   const candidate=products.find(product=>{const variants=z.array(variantSchema).safeParse(product.variants);return variants.success&&variants.data.some(v=>v.id===`demo-${num}`);});
   if(!candidate){skipped++;continue;}
   const variants=z.array(variantSchema).parse(candidate.variants);
   const selected=variants.find(v=>v.id===`demo-${num}`)!;
   const allowed=[`/images/products/product_${num}.webp`,`/images/products/product_${num}-v2.webp`];
   if(selected.images.length!==1||!allowed.includes(selected.images[0])){skipped++;continue;}
   if(!apply){updated++;continue;}
   const correctedApple=entry.number===3&&candidate.name==='Faberlic «Нежный ландыш» — гель для душа';
   const result=await tx.product.updateMany({where:{id:candidate.id,updatedAt:candidate.updatedAt},data:{
    variants:variants.map(v=>v.id===selected.id?{...v,images:entry.needsFullPhoto?[]:[`/images/products/product_${num}-v3.webp`]}:v),
    ...(correctedApple?{name:'Faberlic «Яблочный» — гель для душа',description:'Яблочный гель для душа Faberlic Sunny Caucasus Green Apple. Средство для очищения кожи тела с ароматом зелёного яблока.'}:{}),
   }});
   if(result.count)updated++;else skipped++;
  }
 },{timeout:60000});
 console.log(JSON.stringify({mode:apply?'applied':'dry-run',updated,skipped}));
}finally{await db.$disconnect();}
