// On-device OCR. Everything is served from our own origin (see
// scripts/copy-ocr-assets.js), so nothing leaves the device.
//
// The rest of the app only uses `recognize`, so the engine can be swapped
// (e.g. for PaddleOCR on ONNX Runtime Web) without touching anything else.
import { createWorker, PSM, type Worker } from 'tesseract.js'
import { dewarp } from './dewarp'
import { flattenLighting, warp, type Quad } from './image'

export type ProgressHandler = (status: string, progress: number) => void

/** Width of the straightened passage handed to Tesseract */
const OUTPUT_WIDTH = 2000

let workerPromise: Promise<Worker> | null = null
let onProgress: ProgressHandler = () => {}

const asset = (path: string) => new URL(`ocr/${path}`, document.baseURI).href

function getWorker(): Promise<Worker> {
    workerPromise ??= createWorker('eng', 1, {
        workerPath: asset('worker.min.js'),
        corePath: asset('core'),
        langPath: asset('lang'),
        logger: ({ status, progress }) => onProgress(status, progress),
    })
        .then(async (worker) => {
            // The selection is one block of text; auto layout analysis splits curled lines
            await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK })
            return worker
        })
        .catch((error) => {
            workerPromise = null
            throw error
        })
    return workerPromise
}

/** Start loading the engine early so the first scan is fast (and cached for offline use) */
export function warmUp(): void {
    getWorker().catch((error) => console.warn('OCR warm-up failed', error))
}

/** Straightens the selected corners, evens out the lighting and uncurls the lines */
function prepare(photo: HTMLCanvasElement, corners: Quad): HTMLCanvasElement {
    const { width, height } = photo
    const source = photo.getContext('2d')!.getImageData(0, 0, width, height)
    const quad = corners.map(([x, y]) => [x * width, y * height]) as Quad
    const cleaned = dewarp(flattenLighting(warp(source, quad, OUTPUT_WIDTH)))

    const canvas = document.createElement('canvas')
    canvas.width = cleaned.width
    canvas.height = cleaned.height
    canvas.getContext('2d')!.putImageData(cleaned, 0, 0)
    return canvas
}

/** Reads the text inside `corners` (fractions of the photo's size) */
export async function recognize(
    photo: HTMLCanvasElement,
    corners: Quad,
    progress: ProgressHandler = () => {},
): Promise<string> {
    onProgress = progress
    try {
        progress('preparing image', 0)
        // Let the progress label paint before the synchronous image work
        await new Promise(requestAnimationFrame)
        const canvas = prepare(photo, corners)
        const worker = await getWorker()
        const { data } = await worker.recognize(canvas)
        return data.text
    } finally {
        onProgress = () => {}
    }
}
