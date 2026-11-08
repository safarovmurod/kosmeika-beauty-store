# Product photo review — 8 November 2026

The owner requires the same products and packaging details 1:1. This supersedes the earlier permission to reconstruct unclear details. **No generated reconstruction from this review is selected for publication.** Previous generated Trichup/Pink cutouts are superseded by original photographs with non-generative background removal.

All 28 photographs were inspected. The current selection contains 26 transparent product photos with consistent framing and two empty photo slots awaiting verified full originals. The 1000 × 1200 full-size WebP exports are lossless. Small-source resizing improves consistent presentation; it does not recover lost photographic detail.

## Matching replacement photographs

| No. | Product | Source |
| --- | --- | --- |
| 003 | Faberlic Apple Shower Gel | [Official Faberlic product](https://faberlic.by/index.php?Itemid=2075&id=1001704842203&lang=kz&option=com_catalog&view=goods) |
| 005 | Trichup Herbal Shampoo With Conditioner 400ml | [Noon](https://www.noon.com/uae-en/herbal-shampoo-with-conditioner-400ml/N28185781A/p/) |
| 011 | Coco Pink Pour Femme matching black floral box and mini | [Matching complete set](https://www.mercadolibre.com.mx/set-de-perfumes-100ml15ml-para-mujer-ideal-para-citas/up/MLMU3126144648) |
| 015 | Pink Sexy Scandal 50ml | [Matching pack, ref. B922](https://www.farmaciaamorpy.com/item/perfume-onlyou-50ml-sexy-sacandal-sexy-sexyref-b922-064231) |
| 018 | V.V.LOVE Night Lure shower gel, mist and lotion | [Matching product photograph](https://www.alibaba.com/showroom/v.v-love-body-lotion.html) |
| 022 | Collagen Ultra Protect gold tube and black box | [Asrar](https://asrar-co.com/en/fruit-of-the-wookali-collagen-sunscreen-spf-90-brightening-cream-100-ml/p1342936448) |
| 028 | XQM BB Blemish Base 6 in 1, olive artwork | [Matching pack](https://www.daraz.pk/products/xqm-bb-cream-6-in-1-blemish-base-baby-face-effect-spf-35-48h-hydration-smooth-finish-60ml-i889602541.html) |

Adobe non-generative subject masks/background removal were used. Night Lure and the BB cream use named-object masks to exclude the tray and cosmetic smear. PNG export combines source RGB pixels with the masks as alpha. Exact RGB equality before/after these mask exports was checked. No labels or artwork were redrawn.

## Original-photo corrections and limits

014, 016, 017, 019, 020, 023 and 027 received non-generative tonal correction and masking. Their printed faces, designs and lettering were preserved. Original 024 was retained because automatic tone looked worse. Other good originals were retained and reframed.

002 Air Fresh and 026 red Strawberry bottle are incomplete in the supplied photographs. No full exact match was verified. The incomplete photos are removed from the visible catalog and their photo arrays are empty; the site displays an honest missing-photo label. These two items require full original photographs before replacement can be completed.

Several other originals remain blurred or contain glare over lettering, particularly 014, 016, 017, 020, 023 and 027. Tonal correction cannot recover obscured print. No claim is made that these became high-resolution photography. Generated candidates that changed text, faces, packaging artwork or unseen geometry were rejected.

The previous identification of 003 as lily-of-the-valley was wrong: the actual label and official source say Apple Shower Gel / Яблочный. Only that known old name/description is corrected by the photo maintenance script.

## Maintenance and validation

- Sources and provenance modes: `assets-source/catalog-v3/manifest.json`.
- Export: `scripts/optimize-catalog-photos.mjs`; transparent corners and export dimensions are checked for all 26 files.
- Guarded database update: `scripts/update-catalog-photos.ts`, dry-run by default, explicit `--apply` to update eligible legacy photo paths.
- Local ignored source responses, rejected candidates, backups and QA: `work/photo-refresh-20261108/` and `work/backups/`.
- Product/variant IDs, prices, availability and owner edits are preserved. Eligible variants receive one replacement image; old photographs are not appended as extra gallery images.
