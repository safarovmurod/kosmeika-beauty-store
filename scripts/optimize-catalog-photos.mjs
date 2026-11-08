import sharp from 'sharp';
import {mkdir, readFile, writeFile} from 'node:fs/promises';

// Packaging pixels come only from reviewed photographs. This export step only
// frames/resizes them; it never synthesizes text, missing parts or product detail.
const entries=JSON.parse(await readFile('assets-source/catalog-v3/manifest.json','utf8'));
const output='public/images/products';
await mkdir(output,{recursive:true});
const report=[];
for(const entry of entries){
 if(entry.needsFullPhoto){report.push({number:entry.number,status:'needs-full-photo',needsFullPhoto:true});continue;}
 const {data,info}=await sharp(entry.source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let left=info.width,top=info.height,right=-1,bottom=-1;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>8){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
 if(right<left)throw new Error('Empty product image: '+entry.number);
 const foreground=await sharp(entry.source).extract({left,top,width:right-left+1,height:bottom-top+1}).resize({width:880,height:1056,fit:'inside'}).png().toBuffer();
 const size=await sharp(foreground).metadata();
 const framed=await sharp({create:{width:1000,height:1200,channels:4,background:'#00000000'}}).composite([{input:foreground,left:Math.floor((1000-size.width)/2),top:Math.floor((1200-size.height)/2)}]).png().toBuffer();
 const base=`${output}/product_${String(entry.number).padStart(3,'0')}-v3`;
 await sharp(framed).webp({lossless:true,effort:5}).toFile(base+'.webp');
 await sharp(framed).resize({width:480}).webp({quality:90,alphaQuality:100,effort:5}).toFile(base+'-thumb.webp');
 const {data:decoded,info:decodedInfo}=await sharp(base+'.webp').ensureAlpha().raw().toBuffer({resolveWithObject:true});
 if(decodedInfo.width!==1000||decodedInfo.height!==1200)throw new Error('Invalid export size');
 for(const [x,y] of [[0,0],[999,0],[0,1199],[999,1199]])if(decoded[(y*1000+x)*4+3]!==0)throw new Error('Background must be transparent');
 report.push({number:entry.number,sourceWidth:info.width,sourceHeight:info.height,outputWidth:1000,outputHeight:1200,transparentCorners:true,mode:entry.mode,needsFullPhoto:entry.needsFullPhoto});
}
await mkdir('work/photo-refresh-20261108',{recursive:true});
await writeFile('work/photo-refresh-20261108/export-report.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({exported:report.filter(r=>r.transparentCorners).length,transparent:report.filter(r=>!r.needsFullPhoto).every(r=>r.transparentCorners),newPhotos:report.filter(r=>r.mode==='matching-photo').length,originalCorrections:report.filter(r=>r.mode==='original-tone-and-mask').length,pendingFullPhotos:report.filter(r=>r.needsFullPhoto).map(r=>r.number)}));
