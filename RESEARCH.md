# Research notes

What we've learned building the Levelle proof of concept, so future work doesn't
have to rediscover it. Findings from October 2026.

## OCR engine

### Options considered

| Engine | Runs on device | Notes |
|---|---|---|
| **Tesseract.js 7** (chosen) | Yes, WASM | Fast (~1–2 s per page on desktop), mature, English model with proper spacing. Weak on raw phone photos without preprocessing. |
| PaddleOCR via [`@gutenye/ocr-browser`](https://www.npmjs.com/package/@gutenye/ocr-browser) | Yes, ONNX Runtime Web | Better on unprocessed photos, but see problems below. |
| Other PaddleOCR wrappers (`ppu-paddle-ocr`, `esearch-ocr`, `paddleocr`) | Yes | Not benchmarked. |
| Shape Detection API (`TextDetector`) | Partly | Not available in Safari, so it can't be relied on for mobile web. |

### PaddleOCR problems we hit

- **Missing spaces.** The bundled PP-OCRv4 model is Chinese-first and merges
  English words: "Lennoxwassent", "seen.It". That breaks sentence and word
  counts, which every readability formula depends on. An English recognition
  model (`en_PP-OCRv4_rec`) would probably fix this, but it isn't on npm, so
  we'd have to host it ourselves.
- **Speed.** 5–10 s per page on a desktop CPU with single-threaded WASM,
  against ~1–2 s for Tesseract. Phones will be slower still. Multi-threaded
  WASM needs `SharedArrayBuffer`, which requires cross-origin isolation
  headers. GitHub Pages can't set those.
- **Packaging.** `js-clipper`, a dependency, ships a file that isn't valid UTF-8,
  so Vite can't bundle it without a patch.

Revisit PaddleOCR if Tesseract still falls short on real photos after
preprocessing. Try it with an English recognition model and WebGPU.

### Tesseract.js setup notes

- `tesseract.js@7` needs `tesseract.js-core@7`. npm's `latest` tag for the core
  pointed at 6.1.2, so install the matching version explicitly.
- By default it downloads the worker, core and language data from jsDelivr.
  To stay on device, `scripts/copy-ocr-assets.js` copies them into
  `public/ocr` on install, and `src/ocr.ts` points `workerPath`, `corePath`
  and `langPath` there.
- With `corePath` set to a directory, Tesseract chooses between the
  `relaxedsimd`, `simd` and plain LSTM cores based on what the device supports,
  so all three are copied (~3.9 MB each). Only one is downloaded per device.
- `4.0.0_best_int` English data is 2.8 MB gzipped, versus 10 MB for `4.0.0`.
  We use `best_int`.

## Photo preprocessing

### Benchmark

Synthetic "phone photos" were rendered in headless Chrome: a page of text with
CSS 3D perspective tilt, rotation, a shadow gradient toward the spine, blur,
JPEG compression, and the facing page visible at the edge. Images were
3000×3999, about the size of a 12 MP photo. Three difficulty levels: `clean`,
`mild`, `phone`. Scoring:

- **Recall:** the longest common subsequence of OCR words and true words,
  divided by the true word count.
- **Junk:** OCR words that don't match any true word.

### Results on the hardest (`phone`) image

| Approach | Recall | Junk |
|---|---|---|
| Original app (downscale to 2000 px, grayscale, contrast) | 0.85 | 34 |
| Full resolution | 0.77 | 60 |
| Full resolution + Sauvola thresholding | 0.52 | 153 |
| Rectangular crop | 0.64 | 16 |
| Rectangular crop + page segmentation mode 6 (single block) | 0.76 | 8 |
| Lighting correction, whole image, full resolution | 0.89 | 21 |
| PaddleOCR, whole image | 0.92 | 27 |
| **Four-corner crop + perspective correction + lighting correction** | **1.00** | **0** |

### Takeaways from the synthetic images

- **Uneven lighting and perspective are what break Tesseract.** Resolution
  doesn't matter much: 2000 px was as good as or better than full size.
- **Tesseract's thresholding options are unreliable on photos.**
  `thresholding_method` 1 (Leptonica local normalize) and 2 (Sauvola) were
  often worse than the default Otsu, and results swung widely between images.
- **Rectangular cropping removes junk from the facing page** but doesn't fix
  angled text lines.
- **Corrections are needed together.** Perspective correction alone gave 0.82;
  lighting correction alone gave 0.89 or worse. Together they gave 1.00.
- **Corner placement can be sloppy, as long as it stays outside the text.**
  Corners with a loose margin, or on the page corners, gave 1.00. Corners that
  cut into the text dropped to 0.84–0.92.

### Real photo

**The photo:** an open paperback (C. S. Lewis, *The Four Loves*, p. 55) taken
on a phone. It's 1558×2074 after pasting, so probably downscaled from the
camera original. Problems in the shot:

- **Page curl:** strong curl into the gutter, so lines bow upward on the left.
- **Facing page:** visible down the left edge.
- **Thumb:** covering part of the last lines.

The ground truth is a manual transcription of the visible text, 253 words.

| Approach | Recall | Junk |
|---|---|---|
| Original app | 0.59 | 142 |
| Lighting correction, whole image | 0.69 | 186 |
| Four corners + perspective + lighting (page segmentation mode 3) | 0.89 | 29 |
| Four corners + perspective, no lighting correction | 0.91 | 22 |
| **Four corners + perspective + lighting (page segmentation mode 6)** | **0.91** | **18** |
| Same, dropping lines with confidence < 75 | 0.78 | 3 |

- **The four-corner workflow is the big win on real photos too.** It
  recovered 59% → 91% of words, and junk fell from 142 to 18.
- **Page curl causes nearly all the remaining errors.** They're in the
  top-left lines, which bend into the spine. A homography only fixes flat
  perspective, so dewarping curled pages is the next accuracy step.
- **Lighting correction mattered little here** because the light was fairly
  even. Keep it: it was decisive on the shadowed synthetic photo and costs
  little.
- **Page segmentation mode 6** (`SINGLE_BLOCK`) matched or beat the default
  mode 3 on every test image, and was ~10% faster. The app now uses it.
- **Dropping low-confidence lines trades away too much real text** to be a
  default. It might work as an option.
- **Level of this passage:** grade 8.9, Z, 1010L–1185L. The formulas ranged
  from 6.2 (ARI) to 11.2 (Fog).

### What the app does now (`src/image.ts`, `src/ocr.ts`)

1. Downscale the photo so its longest side is at most 3000 px.
2. The user drags four corners around the passage (`src/corners.ts`).
3. Perspective-warp that quad to an upright 2000 px-wide grayscale image,
   using a homography with bilinear sampling.
4. Even out the lighting: divide each pixel by the mean of a box about 3% of
   the image size around it, using a summed-area table. This removes shadows
   and gradients but keeps text dark.
5. Run Tesseract with Otsu thresholding (the default) and page segmentation
   mode 6 (single block).
6. Clean up the text: strip `|` and `[]` artifacts from page edges, rejoin
   hyphenated words, and unwrap hard line breaks.

### Ideas not yet tried

- Auto-detect the page corners (edge detection plus largest-quadrilateral
  search) so the user only has to adjust them.
- **Correct page curl near the spine.** This is the biggest remaining source
  of errors on real photos (see above). Options:
  - Let the user drag midpoints on the top and bottom edges, then warp in
    strips.
  - Fit curves to the detected text lines and dewarp along them.
- **Benchmark more real phone photos at full camera resolution.**
  Different books, lighting and fonts, including children's picture books
  with large type.

## Reading levels

### Formulas (`src/readability.ts`)

| Formula | Used in consensus | Notes |
|---|---|---|
| Flesch-Kincaid grade | Always | |
| Coleman-Liau | Always | Letter-based, so no syllable errors. |
| Automated Readability Index | Always | Letter-based. |
| Gunning Fog | Always | Tends to run high for children's text. |
| SMOG | Only with 10+ sentences | Designed for 30-sentence samples. Normalized to 30. |
| New Dale-Chall | Only if the raw score is ≥ 5 | Can't go below "grade 4 and below". Uses the `dale-chall` word list. |
| Revised Spache | Only if the result is < 4 | Designed for grades 1–3. Uses the `spache` word list. |

- The **consensus grade** is the median of the applicable formulas, clamped to
  0–16.
- **Syllables** are counted with the [`syllable`](https://www.npmjs.com/package/syllable)
  package.
- **Familiar-word lookups** allow regular inflections (-s, -es, -ies, -ed,
  -ing, -ly, doubled consonants).
- **Names:** capitalized words in the middle of a sentence are treated as
  familiar, so character names in children's books don't inflate Dale-Chall
  and Spache.
- **Short passages:** results under 100 words get a warning.

### Proprietary scales

**Guided Reading (Fountas & Pinnell) and Lexile are proprietary.** We show only
estimates converted from the grade, and label them as approximate:

- **Guided Reading:** commonly published grade-to-letter charts. K = A–D,
  1 = E–J, 2 = K–M, 3 = N–P, 4 = Q–S, 5 = T–V, 6 = W–Y, 7+ = Z. Letters are
  interpolated within each grade.
- **Lexile:** typical mid-year reader ranges per grade, from the grade's floor.
  An official Lexile measure needs MetaMetrics' analyzer.

### Calibration

| Passage | Our result | Published level |
|---|---|---|
| *Charlotte's Web* | Grade 4.7, S | About grade 4.4, R |
| Opening of *The Secret Garden* | Grade 12.1 | Commonly listed lower |

*The Secret Garden* opening has very long sentences, which the formulas weigh
heavily. Formula-based levels ignore content, themes and vocabulary context,
so treat them as a starting point.

## Offline and deployment

- **Service worker:** `public/sw.js` uses network-first for pages and
  cache-first for everything else. Hashed bundles and OCR files never change.
  To invalidate caches after a deploy, bump the `CACHE` version.
- **First visit:** the page isn't controlled by the service worker yet, so it
  waits for `controllerchange` before warming up OCR. Otherwise the OCR files
  wouldn't be cached. The worker calls `clients.claim()` on activate.
- **Worker requests:** requests from Tesseract's dedicated worker (including
  `importScripts`) go through the page's service worker, so they get cached
  too.
- **GitHub Pages:** works with Vite's `base: './'`, and provides the HTTPS
  that phones require for camera access. `public/ocr` isn't committed, so
  the site has to be built in CI (`.github/workflows/deploy.yml`).
- **Camera input:** `<input type="file" accept="image/*" capture="environment">`
  opens the rear camera on phones and a file picker on desktop, without
  needing `getUserMedia`.

## Tooling

- **pnpm 12** blocks dependency build scripts by default. `esbuild` and
  `tesseract.js` are denied in `pnpm-workspace.yaml`: esbuild's binary comes
  from an optional platform package, and tesseract.js only runs an
  OpenCollective message.
- The project's own `postinstall` (copying the OCR files) still runs.

## Sources

- [Lab: replace Tesseract with PaddleOCR for on-device text reading](https://github.com/brycewalls/paper-trail/issues/101)
- [Running OCR entirely in the browser (DEV Community)](https://dev.to/omarmdhi/running-ocr-entirely-in-the-browser-and-making-scanned-pdfs-editable-5bp2)
- [PaddleOCR vs Tesseract vs TrOCR: OCR in the Browser](https://lofttools.com/blog/on-device-ocr-reviewed/)
- [Deterministic OCR in JavaScript: PaddleOCR for the Browser](https://medium.com/@awalariansyah7/deterministic-ocr-in-javascript-paddleocr-for-node-bun-deno-and-the-browser-4c5c3c3e7512)
- [7 Best Open Source OCR Tools for 2026](https://www.llamaindex.ai/insights/7-best-open-source-ocr-tools)
