import { beforeAll, describe, expect, it } from 'vitest'
import { curlOffsets, dewarp, linePitch } from './dewarp'

beforeAll(() => {
    // Node has no ImageData; this is all the code relies on
    globalThis.ImageData ??= class {
        data: Uint8ClampedArray
        constructor(public width: number, public height: number) {
            this.data = new Uint8ClampedArray(width * height * 4)
        }
    } as unknown as typeof ImageData
})

const WIDTH = 480
const HEIGHT = 360
const PITCH = 24

/** Dashed "text lines" every PITCH px that bend by `drift(x)` px */
function page(drift: (x: number) => number): ImageData {
    const image = new ImageData(WIDTH, HEIGHT)
    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            const local = (((y - drift(x)) % PITCH) + PITCH) % PITCH
            const ink = local < 7 && x % 30 < 22
            const o = (y * WIDTH + x) * 4
            image.data[o] = image.data[o + 1] = image.data[o + 2] = ink ? 20 : 240
            image.data[o + 3] = 255
        }
    }
    return image
}

/** Row where the first text line starts in columns [x0, x1) */
function firstLine(image: ImageData, x0: number, x1: number): number {
    for (let y = 0; y < HEIGHT; y++) {
        let ink = 0
        for (let x = x0; x < x1; x++) if (image.data[(y * WIDTH + x) * 4] < 128) ink++
        if (ink > (x1 - x0) / 3) return y
    }
    return -1
}

describe('linePitch', () => {
    it('finds the spacing between lines', () => {
        const profile = new Float32Array(HEIGHT).map((_, y) => (y % PITCH < 7 ? 100 : 0))
        expect(linePitch(profile)).toBe(PITCH)
    })
})

describe('curlOffsets', () => {
    it('is flat for straight lines', () => {
        const { offsets } = curlOffsets(page(() => 0))
        for (const strip of offsets) for (const offset of strip) expect(Math.abs(offset)).toBeLessThanOrEqual(1)
    })
})

describe('dewarp', () => {
    it('levels lines that curve up toward one edge', () => {
        // Lines bend 10px from the middle to the left edge, like a page curling into the spine
        const curled = page((x) => 10 * Math.max(0, 1 - x / (WIDTH / 2)) ** 2)
        expect(firstLine(curled, 0, 30) - firstLine(curled, 330, 360)).toBeGreaterThan(8)

        const flat = dewarp(curled)
        expect(Math.abs(firstLine(flat, 0, 30) - firstLine(flat, 330, 360))).toBeLessThanOrEqual(3)
    })
})
