import { beforeAll, describe, expect, it } from 'vitest'
import { flattenLighting, homography, warp, warpedSize, type Quad } from './image'

beforeAll(() => {
    // Node has no ImageData; this is all the code relies on
    globalThis.ImageData ??= class {
        data: Uint8ClampedArray
        constructor(public width: number, public height: number) {
            this.data = new Uint8ClampedArray(width * height * 4)
        }
    } as unknown as typeof ImageData
})

function apply(H: number[], [x, y]: [number, number]): [number, number] {
    const z = H[6] * x + H[7] * y + 1
    return [(H[0] * x + H[1] * y + H[2]) / z, (H[3] * x + H[4] * y + H[5]) / z]
}

function gray(width: number, height: number, value: (x: number, y: number) => number): ImageData {
    const image = new ImageData(width, height)
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const o = (y * width + x) * 4
            image.data[o] = image.data[o + 1] = image.data[o + 2] = value(x, y)
            image.data[o + 3] = 255
        }
    }
    return image
}

describe('homography', () => {
    it('maps each corner onto its target', () => {
        const from: Quad = [[0, 0], [100, 0], [100, 50], [0, 50]]
        const to: Quad = [[10, 20], [300, 5], [320, 260], [0, 240]]
        const H = homography(from, to)
        from.forEach((point, i) => {
            const [x, y] = apply(H, point)
            expect(x).toBeCloseTo(to[i][0], 6)
            expect(y).toBeCloseTo(to[i][1], 6)
        })
    })
})

describe('warpedSize', () => {
    it('keeps the aspect ratio of the selection', () => {
        expect(warpedSize([[0, 0], [400, 0], [400, 200], [0, 200]], 2000)).toEqual([2000, 1000])
    })

    it('limits very tall selections', () => {
        const [w, h] = warpedSize([[0, 0], [100, 0], [100, 1000], [0, 1000]], 2000)
        expect(h).toBeLessThanOrEqual(4000)
        expect(w).toBe(400)
    })
})

describe('warp', () => {
    it('extracts the selected region upright', () => {
        // Left half dark, right half light
        const source = gray(200, 100, (x) => (x < 100 ? 0 : 255))
        const out = warp(source, [[100, 0], [199, 0], [199, 99], [100, 99]], 50)
        expect(out.width).toBe(50)
        expect(out.data[(25 * 50 + 25) * 4]).toBe(255)
    })
})

describe('flattenLighting', () => {
    it('evens out a lighting gradient but keeps dark text dark', () => {
        // Paper fades from 240 to 120 left to right; a dark "letter" sits in the shadow
        const image = gray(200, 100, (x, y) => (x > 150 && x < 156 && y > 40 && y < 60 ? 30 : 240 - (120 * x) / 200))
        const out = flattenLighting(image)
        const at = (x: number, y: number) => out.data[(y * 200 + x) * 4]
        expect(Math.abs(at(20, 20) - at(180, 20))).toBeLessThan(25)
        expect(at(153, 50)).toBeLessThan(at(180, 20) / 2)
    })
})
