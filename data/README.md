# Benchmark photos

Real phone photos of book pages and their transcriptions, used by
`pnpm bench` (see `bench/` and `RESEARCH.md`).

**Only this README is committed.** The photos and transcriptions are of
copyrighted books, so they stay local (see `.gitignore`). `pnpm bench` skips
any photo listed in `bench/cases.js` that isn't present.

## Adding a photo

1. Save the original photo from the phone (not a screenshot or a pasted copy)
   as `scan-N.jpg`.
2. Optionally transcribe the visible passage into `scan-N.txt`:
   - plain text, one paragraph per line;
   - rejoin words hyphenated across lines;
   - write `<...>` (e.g. `<FINGER>`) for text you can't see.
   Without a transcription, the benchmark still saves the OCR output to
   `bench/out/` but can't score it.
3. Add an entry to `bench/cases.js` with the corners a reader would drag:
   just outside the text block, as fractions of the image's width and height.

## Sharing a dataset

To build a set that can be committed, photograph public-domain books instead,
for example US editions published before 1930. The photos are yours, and the
text is free to transcribe and share.
