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

### Benchmark (`pnpm bench`)

**Trust the real scans, not the synthetic images.** The first rounds of
testing used synthetic photos and a single pasted (downscaled) photo with
corners placed to the pixel. They overstated accuracy: the version that scored
0–12% word error rate on those got **38%** on a real full-resolution scan.

`bench/run.js` runs the app's own image code (`src/image.ts`,
`src/dewarp.ts`) and Tesseract in headless Chrome:

- **Inputs:** each photo in `bench/cases.js`, with corners where a reader
  would drag them.
- **Variants:** several processing variants per photo.
- **Output:** a score for each. The straightened images and text are saved to
  `bench/out/` for inspection.
- **Running it:** `pnpm bench` runs everything; `pnpm bench app-dewarp
  raw-psm3` runs only the named variants. Set `CHROME_PATH` if Chrome isn't in
  the default macOS location.

**Scoring**, after lowercasing, removing apostrophes and rejoining
line-break hyphens:

- **WER:** word error rate, the word-level edit distance divided by the
  transcription's word count. Lower is better; it counts junk words too.
- **Recall:** matched words (longest common subsequence) divided by the
  transcription's word count.

**Dataset** (`data/`):

- **Photos:** real full-resolution phone photos (3472×4624) of an open
  paperback, C. S. Lewis's *The Four Loves*.
- **Kept local:** the photos and transcriptions are of a copyrighted book, so
  they aren't committed (`data/README.md` explains how to add your own). A
  shareable set would need public-domain books.
- **Transcriptions:** the `.txt` files are hand transcriptions. `<...>` marks
  text that can't be seen, such as under a thumb, and is skipped.
- **Known typos:**
  - `scan-2.txt`: "intented" and "banners";
  - `scan-3.txt`: "use" for "us";
  - `scan-4.txt`: "into other" for "into the other", "fiend" ×2 for "friend",
    "expect" for "except".

  They cost every variant the same few words, so comparisons are unaffected.
- **Common problems in the photos:** page curl into the spine, the facing page
  visible, and a thumb in frame.

### Results on real scans (word error rate)

Scored on the text after `src/text.ts` cleanup, which is what readers see.

| Variant | Scan 1 | Scan 2 | Scan 3 | Scan 4 |
|---|---|---|---|---|
| Raw photo, Tesseract defaults (psm 3) | 52% | 81% | 57% | 26% |
| Corners + perspective + lighting (shipped before dewarp) | 8% | 11% | 38% | 21% |
| **+ dewarp (current app)** | **1%** | **6%** | **1%** | **6%** |
| + dewarp, corners ~4% looser | 1% | 5% | 10% | 8% |
| + dewarp, corners never moved (default 8% inset) | 14% | 16% | 20% | 24% |

**About the scan 4 score:** most of its 6% comes from transcription slips,
not OCR. The OCR text is correct where the transcription has "into other
loves" (for "into the other loves"), "fiend" ×2 (for "friend") and "expect"
(for "except"). Its one real error at the start is "door" for "floor" in the
steeply curled first line.

### Takeaways

- **Page curl is the main failure on real photos.** Even after perspective
  correction, lines near the spine and the top of the page bow by more than a
  line height. In single-block mode Tesseract then splices neighbouring lines
  together. Scan 3 lost almost its whole top half this way. Dewarping fixed it
  (38% → 1%).
- **Corners matter.** Leaving the default corners pulls in the facing page's
  text, giving 14–24% word error rate. Loose but sensible placement is fine.
  Auto-detecting the text block would remove this failure mode.
- **The steeply curled first line** still fails sometimes (scan 2's first
  line; "door" for "floor" in scan 4).
- **Single-character slips** ("1s" for "is") are fixed by `src/text.ts`.
- **Raw OCR of a whole phone photo is unusable** (52–82% word error rate). The
  preprocessing does the heavy lifting.

### Dewarping (`src/dewarp.ts`)

Perspective correction handles a flat page seen at an angle. Dewarping
handles the bend that remains:

1. **Strips:** cut the straightened page into 16 vertical strips.
2. **Profiles:** in each strip, sum the ink in each row. This gives a profile
   with a peak per text line.
3. **Line spacing:** estimate it from the autocorrelation of the middle of the
   page.
4. **Drift between strips:** for each of 10 overlapping horizontal bands, find
   the vertical shift that best aligns neighbouring strips' profiles. The
   search is limited to ±0.45 × line spacing, so lines can't be matched to the
   wrong neighbour. Blank bands are filled by interpolation.
5. **Offsets:** chain the drifts outward from the middle strip to get an
   offset for every strip and band.
6. **Remap:** interpolate those offsets bilinearly and shift each column
   vertically.

It adds a few hundred milliseconds and needs no extra data.

### Early synthetic tests

Before real scans were available, synthetic "phone photos" were rendered in
headless Chrome: CSS 3D tilt, a shadow gradient toward the spine, blur, JPEG
compression, and a facing page.

They taught some real lessons:

- Lighting and perspective, not resolution, break Tesseract.
- Tesseract's Sauvola and local-normalize thresholding (`thresholding_method`
  2 and 1) are worse than the default Otsu on photos.
- Lighting correction and perspective correction work best together.

But they had no page curl, camera noise or paper texture, so their near-perfect
scores didn't carry over to real photos. Treat any result from synthetic images
as an upper bound.

Other findings from that phase:

- **Single block mode:** page segmentation mode 6 (`SINGLE_BLOCK`) matched or
  beat the default mode 3 and was ~10% faster.
- **Confidence filtering:** dropping lines with confidence < 75 removed junk
  but also too much real text (recall 0.91 → 0.78).
- **PaddleOCR:** recovered 92% of words on a synthetic photo, versus 85% for
  unprocessed Tesseract. See the engine notes above for why we didn't switch.

### Orientation

- **Phones often save book photos sideways.** Pointing the camera straight
  down at a flat book confuses the orientation sensor. Tesseract fails
  completely on sideways text: the same real photo rotated 90° recovered 3% of
  words with 223 junk, against 90% upright.
- **The app has a Rotate button** that turns the photo 90° clockwise.
- **One canvas for preview and OCR.** The photo is decoded once into a
  canvas, with `createImageBitmap(file, { imageOrientation: 'from-image' })`
  so EXIF orientation is applied. The preview and OCR both use that canvas,
  so what the user sees is always what gets read.
- **Possible improvement:** detect orientation automatically. Tesseract's OSD
  needs `osd.traineddata` and the legacy engine, which would add size. A
  cheaper heuristic: OCR a small center crop at 0° and 90° and keep the one
  with higher confidence.

### What the app does now (`src/image.ts`, `src/dewarp.ts`, `src/ocr.ts`, `src/text.ts`)

1. Decode the photo, honoring its EXIF orientation, and downscale it so its
   longest side is at most 3000 px. The user can rotate it in 90° steps.
2. The user drags four corners around the passage (`src/corners.ts`).
3. Perspective-warp that quad to an upright 2000 px-wide grayscale image,
   using a homography with bilinear sampling.
4. Even out the lighting: divide each pixel by the mean of a box about 3% of
   the image size around it, using a summed-area table.
5. Dewarp curled lines (see above).
6. Run Tesseract with Otsu thresholding (the default) and page segmentation
   mode 6 (single block).
7. Clean up the text:
   - strip page-edge junk (`| \ [ ] © …`) from line ends;
   - fix `1` read for a lowercase `i`;
   - rejoin hyphenated words and unwrap hard line breaks.

### Ideas not yet tried

- **Auto-detect the text block or page corners** and start the handles there.
  Untouched default corners are now the biggest source of error (14–24%).
- **Steeper curl:** the first lines of scans 2 and 4 still fail. Possible fixes:
  - more strips near the spine;
  - fitting a smooth curve to each line, not piecewise shifts.
- **More real photos:** other books, lighting and fonts, especially children's
  books with large type and illustrations, which may confuse the line
  profiles.
- **PaddleOCR with an English model:** revisit, measured with `pnpm bench` on
  the real scans.

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
