// On-device OCR. Everything is served from our own origin (see
// scripts/copy-ocr-assets.js), so nothing leaves the device.
//
// The rest of the app only uses `recognize`, so the engine can be swapped
// (e.g. for PaddleOCR on ONNX Runtime Web) without touching anything else.
import { createWorker, type Worker } from 'tesseract.js'

export type ProgressHandler = (status: string, progress: number) => void

let workerPromise: Promise<Worker> | null = null
let onProgress: ProgressHandler = () => {}

const asset = (path: string) => new URL(`ocr/${path}`, document.baseURI).href

function getWorker(): Promise<Worker> {
    workerPromise ??= createWorker('eng', 1, {
        workerPath: asset('worker.min.js'),
        corePath: asset('core'),
        langPath: asset('lang'),
        logger: ({ status, progress }) => onProgress(status, progress),
    }).catch((error) => {
        workerPromise = null
        throw error
    })
    return workerPromise
}

/** Start loading the engine early so the first scan is fast (and cached for offline use) */
export function warmUp(): void {
    getWorker().catch((error) => console.warn('OCR warm-up failed', error))
}

/** Downscale and grayscale large camera photos; OCR is faster and no less accurate */
async function prepare(image: Blob): Promise<HTMLCanvasElement> {
    const bitmap = await createImageBitmap(image)
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)

    const context = canvas.getContext('2d')!
    context.filter = 'grayscale(1) contrast(1.2)'
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    return canvas
}

export async function recognize(image: Blob, progress: ProgressHandler = () => {}): Promise<string> {
    onProgress = progress
    try {
        const [worker, canvas] = await Promise.all([getWorker(), prepare(image)])
        const { data } = await worker.recognize(canvas)
        return data.text
    } finally {
        onProgress = () => {}
    }
}
