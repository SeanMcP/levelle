// Image cleanup for photos of book pages: straighten the page and even out
// the lighting before OCR. Tesseract struggles with skewed lines and
// shadows; with both fixed it reads phone photos about as well as scans.

export type Point = [x: number, y: number]
/** Corners in order: top-left, top-right, bottom-right, bottom-left */
export type Quad = [Point, Point, Point, Point]

const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1])

/** Solves for the 3x3 projective transform (as 9 numbers) mapping `from` onto `to` */
export function homography(from: Quad, to: Quad): number[] {
    const A: number[][] = []
    const b: number[] = []
    for (let i = 0; i < 4; i++) {
        const [x, y] = from[i]
        const [u, v] = to[i]
        A.push([x, y, 1, 0, 0, 0, -u * x, -u * y])
        b.push(u)
        A.push([0, 0, 0, x, y, 1, -v * x, -v * y])
        b.push(v)
    }

    // Gauss-Jordan elimination with partial pivoting
    for (let col = 0; col < 8; col++) {
        let pivot = col
        for (let row = col + 1; row < 8; row++) {
            if (Math.abs(A[row][col]) > Math.abs(A[pivot][col])) pivot = row
        }
        ;[A[col], A[pivot]] = [A[pivot], A[col]]
        ;[b[col], b[pivot]] = [b[pivot], b[col]]
        for (let row = 0; row < 8; row++) {
            if (row === col) continue
            const factor = A[row][col] / A[col][col]
            for (let k = col; k < 8; k++) A[row][k] -= factor * A[col][k]
            b[row] -= factor * b[col]
        }
    }

    return [...b.map((value, i) => value / A[i][i]), 1]
}

/** Output size for a straightened quad, keeping its average aspect ratio */
export function warpedSize(quad: Quad, width: number): [number, number] {
    const [tl, tr, br, bl] = quad
    const ratio = (distance(tl, bl) + distance(tr, br)) / (distance(tl, tr) + distance(bl, br))
    // Keep very tall selections to a size OCR (and flattenLighting's sums) can handle
    const fitted = Math.min(width, Math.round(4000 / ratio))
    return [Math.max(1, fitted), Math.max(1, Math.round(fitted * ratio))]
}

/** Maps the quad in `source` onto an upright rectangle, as grayscale */
export function warp(source: ImageData, quad: Quad, width: number): ImageData {
    const [w, h] = warpedSize(quad, width)
    const H = homography([[0, 0], [w, 0], [w, h], [0, h]], quad)
    const out = new ImageData(w, h)
    const s = source.data
    const d = out.data
    const sw = source.width

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const z = H[6] * x + H[7] * y + 1
            const sx = (H[0] * x + H[1] * y + H[2]) / z
            const sy = (H[3] * x + H[4] * y + H[5]) / z
            const x0 = Math.floor(sx)
            const y0 = Math.floor(sy)
            const o = (y * w + x) * 4
            d[o + 3] = 255

            if (x0 < 0 || y0 < 0 || x0 >= sw - 1 || y0 >= source.height - 1) {
                d[o] = d[o + 1] = d[o + 2] = 255
                continue
            }

            // Bilinear sample of luminance
            const fx = sx - x0
            const fy = sy - y0
            const i = (y0 * sw + x0) * 4
            const lum = (j: number) => 0.299 * s[j] + 0.587 * s[j + 1] + 0.114 * s[j + 2]
            const top = lum(i) * (1 - fx) + lum(i + 4) * fx
            const bottom = lum(i + sw * 4) * (1 - fx) + lum(i + sw * 4 + 4) * fx
            d[o] = d[o + 1] = d[o + 2] = top * (1 - fy) + bottom * fy
        }
    }

    return out
}

/**
 * Evens out shadows and uneven lighting in a grayscale image by dividing
 * each pixel by the average brightness around it (a large box blur).
 */
export function flattenLighting(image: ImageData, radiusFraction = 0.03): ImageData {
    const { width: w, height: h, data } = image
    const r = Math.max(8, Math.round(Math.max(w, h) * radiusFraction))

    // Summed-area table makes each box average O(1)
    const stride = w + 1
    const sums = new Uint32Array(stride * (h + 1))
    for (let y = 0; y < h; y++) {
        let row = 0
        for (let x = 0; x < w; x++) {
            row += data[(y * w + x) * 4]
            sums[(y + 1) * stride + x + 1] = sums[y * stride + x + 1] + row
        }
    }

    const out = new ImageData(w, h)
    const d = out.data
    for (let y = 0; y < h; y++) {
        const y0 = Math.max(0, y - r)
        const y1 = Math.min(h, y + r + 1)
        for (let x = 0; x < w; x++) {
            const x0 = Math.max(0, x - r)
            const x1 = Math.min(w, x + r + 1)
            const total = sums[y1 * stride + x1] - sums[y0 * stride + x1] - sums[y1 * stride + x0] + sums[y0 * stride + x0]
            const mean = total / ((x1 - x0) * (y1 - y0))
            const o = (y * w + x) * 4
            d[o] = d[o + 1] = d[o + 2] = Math.min(255, (data[o] / (mean + 1)) * 235)
            d[o + 3] = 255
        }
    }

    return out
}

/** Decodes a photo (honoring its EXIF orientation) into a canvas no larger than `maxSide` */
export async function loadPhoto(file: Blob, maxSide: number): Promise<HTMLCanvasElement> {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    return canvas
}

/** Returns a copy of the canvas turned 90° clockwise */
export function rotateClockwise(source: HTMLCanvasElement): HTMLCanvasElement {
    const canvas = document.createElement('canvas')
    canvas.width = source.height
    canvas.height = source.width
    const context = canvas.getContext('2d')!
    context.translate(canvas.width, 0)
    context.rotate(Math.PI / 2)
    context.drawImage(source, 0, 0)
    return canvas
}
