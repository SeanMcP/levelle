// Copies the Tesseract worker, WASM cores and English language data into
// public/ocr so OCR runs entirely from our own origin (no CDN).
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const modules = join(root, 'node_modules')
const out = join(root, 'public', 'ocr')

const files = [
    ['tesseract.js/dist/worker.min.js', 'worker.min.js'],
    ['tesseract.js-core/tesseract-core-lstm.wasm.js', 'core/tesseract-core-lstm.wasm.js'],
    ['tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'core/tesseract-core-simd-lstm.wasm.js'],
    ['tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js', 'core/tesseract-core-relaxedsimd-lstm.wasm.js'],
    ['@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'lang/eng.traineddata.gz'],
]

for (const [from, to] of files) {
    const dest = join(out, to)
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(join(modules, from), dest)
}

console.log(`📖 Copied ${files.length} OCR assets to public/ocr`)
