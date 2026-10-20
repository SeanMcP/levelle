// Browser half of the OCR benchmark (see run.js). Uses the app's own image
// code so results reflect what ships.
import { createWorker, type PSM, type Worker } from 'tesseract.js'
import { dewarp } from '../src/dewarp'
import { flattenLighting, loadPhoto, warp, type Quad } from '../src/image'

export interface Variant {
    /** Corners as fractions of the image; omit to OCR the whole photo untouched */
    corners?: Quad
    flatten?: boolean
    dewarp?: boolean
    psm?: number
    photoMax?: number
    outputWidth?: number
}

const asset = (path: string) => new URL(`/ocr/${path}`, location.origin).href
let worker: Promise<Worker> | undefined

function getWorker() {
    worker ??= createWorker('eng', 1, {
        workerPath: asset('worker.min.js'),
        corePath: asset('core'),
        langPath: asset('lang'),
    })
    return worker
}

function toCanvas(image: ImageData): HTMLCanvasElement {
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    canvas.getContext('2d')!.putImageData(image, 0, 0)
    return canvas
}

async function prepare(url: string, variant: Variant): Promise<HTMLCanvasElement> {
    const photo = await loadPhoto(await (await fetch(url)).blob(), variant.photoMax ?? 3000)
    if (!variant.corners) return photo

    const { width, height } = photo
    const source = photo.getContext('2d')!.getImageData(0, 0, width, height)
    const quad = variant.corners.map(([x, y]) => [x * width, y * height]) as Quad
    const warped = warp(source, quad, variant.outputWidth ?? 2000)
    const flattened = variant.flatten ? flattenLighting(warped) : warped
    return toCanvas(variant.dewarp ? dewarp(flattened) : flattened)
}

declare global {
    interface Window {
        runVariant: (url: string, variant: Variant) => Promise<{ text: string; ms: number; image: string }>
        benchReady: boolean
    }
}

window.runVariant = async (url, variant) => {
    const tesseract = await getWorker()
    const canvas = await prepare(url, variant)
    await tesseract.setParameters({ tessedit_pageseg_mode: String(variant.psm ?? 6) as PSM })
    const start = performance.now()
    const { data } = await tesseract.recognize(canvas)
    return {
        text: data.text,
        ms: Math.round(performance.now() - start),
        image: canvas.toDataURL('image/jpeg', 0.8),
    }
}

window.benchReady = true
