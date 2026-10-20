// OCR benchmark: runs each variant on each photo in bench/cases.js in
// headless Chrome and scores the text against the transcriptions.
//
//   pnpm bench                 all variants
//   pnpm bench app raw-psm3    only the named variants
//
// Straightened images are saved to bench/out for inspection.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'
import { cleanOcrText } from '../src/text.ts'
import { cases } from './cases.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'bench', 'out')
const chrome = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const variants = {
    'raw-psm3': { psm: 3 },
    'raw-psm6': { psm: 6 },
    app: { crop: true, flatten: true, psm: 6 },
    'app-dewarp': { crop: true, flatten: true, dewarp: true, psm: 6 },
    'app-dewarp-psm3': { crop: true, flatten: true, dewarp: true, psm: 3 },
    'loose-dewarp': { crop: 'loose', flatten: true, dewarp: true, psm: 6 },
    'default-dewarp': { crop: 'default', flatten: true, dewarp: true, psm: 6 },
    'crop-psm6': { crop: true, psm: 6 },
    'crop-flatten-psm3': { crop: true, flatten: true, psm: 3 },
    'crop-psm3': { crop: true, psm: 3 },
}

const DEFAULT_CORNERS = [[0.08, 0.08], [0.92, 0.08], [0.92, 0.92], [0.08, 0.92]]

/** Corners pushed ~4% further out, like a hurried fingertip */
const loosen = (corners) =>
    corners.map(([x, y], i) => [
        Math.min(1, Math.max(0, x + (i === 1 || i === 2 ? 0.04 : -0.04))),
        Math.min(1, Math.max(0, y + (i >= 2 ? 0.03 : -0.03))),
    ])

function cornersFor(variant, testCase) {
    if (variant.crop === 'default') return DEFAULT_CORNERS
    if (variant.crop === 'loose') return loosen(testCase.corners)
    return variant.crop ? testCase.corners : undefined
}

/** Lowercased words, with line-break hyphens rejoined and <unreadable> spans removed */
function words(text) {
    return (
        text
            .replace(/<[^>]*>/g, ' ')
            .replace(/[‘’']/g, '')
            .replace(/(\w)-\s*\n\s*(\w)/g, '$1$2')
            .toLowerCase()
            .match(/[a-z0-9]+/g) ?? []
    )
}

/** Word error rate (edits / truth length) and recall (matched words / truth length) */
function score(truthText, ocrText) {
    const truth = words(truthText)
    const ocr = words(ocrText)
    let edits = Array.from({ length: ocr.length + 1 }, (_, j) => j)
    let lcs = new Array(ocr.length + 1).fill(0)
    for (let i = 1; i <= truth.length; i++) {
        const nextEdits = [i]
        const nextLcs = [0]
        for (let j = 1; j <= ocr.length; j++) {
            const same = truth[i - 1] === ocr[j - 1]
            nextEdits[j] = Math.min(edits[j] + 1, nextEdits[j - 1] + 1, edits[j - 1] + (same ? 0 : 1))
            nextLcs[j] = same ? lcs[j - 1] + 1 : Math.max(lcs[j], nextLcs[j - 1])
        }
        edits = nextEdits
        lcs = nextLcs
    }
    return {
        wer: edits[ocr.length] / truth.length,
        recall: lcs[ocr.length] / truth.length,
    }
}

const pct = (value) => `${(value * 100).toFixed(0)}%`.padStart(5)

// Photos aren't committed (see data/README.md), so run whichever are present
const available = cases.filter(({ image }) => existsSync(join(root, image)))
const missing = cases.length - available.length
if (!available.length) {
    console.error('No benchmark photos found. See data/README.md for how to add them.')
    process.exit(1)
}
if (missing) console.warn(`Skipping ${missing} photo(s) not found in data/`)

const selected = process.argv.slice(2)
const runVariants = Object.entries(variants).filter(([name]) => !selected.length || selected.includes(name))

mkdirSync(out, { recursive: true })
const server = await createServer({ root, logLevel: 'error', server: { port: 5299 } })
await server.listen()
const browser = await chromium.launch({ executablePath: chrome })

try {
    const page = await browser.newPage()
    page.on('pageerror', (error) => console.error('page error:', error.message))
    await page.goto('http://localhost:5299/bench/')
    await page.waitForFunction(() => window.benchReady)

    console.log(`${'variant'.padEnd(20)}${'photo'.padEnd(12)}  WER  recall    time`)
    for (const [name, variant] of runVariants) {
        for (const testCase of available) {
            const { image } = testCase
            const truth = testCase.truth && existsSync(join(root, testCase.truth)) ? testCase.truth : undefined
            const options = { psm: variant.psm, flatten: variant.flatten, dewarp: variant.dewarp, corners: cornersFor(variant, testCase) }
            const result = await page.evaluate(([url, o]) => window.runVariant(url, o), [`/${image}`, options])

            const base = `${image.replace(/^.*\/|\.\w+$/g, '')}.${name}`
            writeFileSync(join(out, `${base}.txt`), result.text)
            writeFileSync(join(out, `${base}.jpg`), Buffer.from(result.image.split(',')[1], 'base64'))

            const label = `${name.padEnd(20)}${image.replace(/^.*\//, '').padEnd(12)}`
            if (!truth) {
                console.log(`${label}    –      –  ${`${result.ms}ms`.padStart(6)}`)
                continue
            }
            // Score the cleaned text, which is what readers see
            const { wer, recall } = score(readFileSync(join(root, truth), 'utf8'), cleanOcrText(result.text))
            console.log(`${label}${pct(wer)}  ${pct(recall)}  ${`${result.ms}ms`.padStart(6)}`)
        }
    }
} finally {
    await browser.close()
    await server.close()
}
