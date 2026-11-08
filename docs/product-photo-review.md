# Product photo review — 8 November 2026

All 28 originals were inspected. `scripts/catalog-content.json` records visible names, basic product types, sources, and unresolved identifications. No prices, stock quantities, authenticity claims, medical effects, or complete ingredient lists were inferred from packaging.

Two replacements match the product name, size, bottle, and packaging in the originals:

| Original | Reviewed replacement | Source |
| --- | --- | --- |
| product_005.png | product_005-v2.png / .webp | [Trichup Herbal Shampoo With Conditioner 400ml](https://www.noon.com/uae-en/herbal-shampoo-with-conditioner-400ml/N28185781A/p/) |
| product_015.png | product_015-v2.png / .webp | [Pink Sexy Scandal 50ml, ref. B922](https://www.farmaciaamorpy.com/item/perfume-onlyou-50ml-sexy-sacandal-sexy-sexyref-b922-064231) |

The source photos were isolated with the built-in imagegen tool using alpha transparency. These are AI-processed cutouts, not untouched manufacturer photography. The original files remain available. In particular, small print can differ after AI processing; consult the physical package for authoritative labeling.

The exact prompt template used for both accepted images was:

> Use case: background-extraction. Edit target: the supplied real product photograph. Remove ONLY the surrounding background and floor; output a clean genuinely transparent PNG cutout of SUBJECT. Keep the EXACT original products, packaging, proportions, colors, bottle contents, printed logos, labels, typography and readable text pixel-faithful. Do not invent or redraw product details, add objects, add shadows, alter brands, replace packaging, or crop any part. Isolate all product objects shown with modest clear transparent margin and no scene, no border, no reflections of objects on the ground. This is for a real store catalog, exact product identity matters more than aesthetic changes.

SUBJECT was `the single green-and-yellow Trichup 400ml shampoo bottle` and `the Pink Sexy Scandal Sexy Sexy 50ml box and its gold-capped perfume bottle` respectively.

A matching Coco Pink set was found, but both background removal attempts left visible colored background. Those generated candidates were rejected; the original image is retained. The remaining source images are retained wherever an exact replacement was not verified. In particular the incomplete Air Fresh can must not be replaced by a guessed scent.

`scripts/enrich-catalog.ts` updates only untouched demo records with their expected original image and variant ID. It first saves a local ignored backup, then changes names, descriptions, categories, and the two reviewed image paths. Product IDs, variant IDs, prices, availability and owner edits are preserved. It is an explicit maintenance command, never part of deployment or application startup.
