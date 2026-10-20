// Straightens text lines that curve because the page bends toward the
// spine. Perspective correction (image.ts) handles a flat page seen at an
// angle; this handles the bend that remains.
//
// The page is cut into vertical strips. Within each strip, summing the ink
// in every row gives a profile with a peak per text line. Comparing a
// strip's profile with its neighbour's shows how far the lines drift up or
// down between them, separately for each band of lines. Chaining those
// drifts from the middle strip outward gives a vertical offset for every
// point, and shifting each column by it straightens the lines.

const STRIPS = 16
const BANDS = 10

/** Darkness of each pixel (0 = paper), from a grayscale image's red channel */
function inkMap({ data, width, height }: ImageData): Float32Array {
    const ink = new Float32Array(width * height)
    for (let i = 0; i < ink.length; i++) ink[i] = Math.max(0, 200 - data[i * 4])
    return ink
}

/** Row sums of ink for columns [x0, x1) */
function rowProfile(ink: Float32Array, width: number, height: number, x0: number, x1: number): Float32Array {
    const profile = new Float32Array(height)
    for (let y = 0; y < height; y++) {
        let sum = 0
        for (let x = x0; x < x1; x++) sum += ink[y * width + x]
        profile[y] = sum
    }
    return profile
}

/** Distance between text lines, from the profile's autocorrelation */
export function linePitch(profile: Float32Array): number {
    const n = profile.length
    let mean = 0
    for (const value of profile) mean += value
    mean /= n

    const correlation = (lag: number) => {
        let sum = 0
        for (let y = 0; y + lag < n; y++) sum += (profile[y] - mean) * (profile[y + lag] - mean)
        return sum / (n - lag)
    }

    // First clear peak after the correlation dips below zero
    let lag = 4
    while (lag < n / 4 && correlation(lag) > 0) lag++
    let best = lag
    let bestValue = -Infinity
    for (; lag < n / 4; lag++) {
        const value = correlation(lag)
        if (value > bestValue) {
            best = lag
            bestValue = value
        } else if (bestValue > 0 && value < bestValue * 0.5) {
            break
        }
    }
    return best
}

/**
 * Vertical shift that best aligns b with a within rows [y0, y1), or NaN when
 * the band has too little text to tell
 */
function bestShift(a: Float32Array, b: Float32Array, y0: number, y1: number, maxShift: number): number {
    let best = 0
    let bestScore = -Infinity
    let zeroScore = 0
    let energy = 0
    for (let y = y0; y < y1; y++) energy += a[y] * a[y]
    if (energy === 0) return NaN

    for (let shift = -maxShift; shift <= maxShift; shift++) {
        let score = 0
        for (let y = y0; y < y1; y++) {
            const other = b[y + shift]
            if (other !== undefined) score += a[y] * other
        }
        if (shift === 0) zeroScore = score
        if (score > bestScore) {
            bestScore = score
            best = shift
        }
    }
    // A flat correlation means no reliable match (e.g. a blank band)
    return bestScore > zeroScore * 1.02 || best === 0 ? best : NaN
}

/** Replaces NaNs with the nearest valid values, linearly interpolated (0 if none) */
function fillGaps(values: number[]): number[] {
    const known = values.map((value, i) => [i, value]).filter(([, value]) => !Number.isNaN(value))
    if (!known.length) return values.map(() => 0)
    return values.map((value, i) => {
        if (!Number.isNaN(value)) return value
        const before = known.filter(([j]) => j < i).at(-1)
        const after = known.find(([j]) => j > i)
        if (!before) return after![1]
        if (!after) return before[1]
        const t = (i - before[0]) / (after[0] - before[0])
        return before[1] + t * (after[1] - before[1])
    })
}

/**
 * Vertical offsets (in pixels) at each strip centre × band centre, relative
 * to the middle strip. offsets[strip][band]
 */
export function curlOffsets(image: ImageData): { offsets: number[][]; pitch: number } {
    const { width, height } = image
    const ink = inkMap(image)
    const stripWidth = width / STRIPS
    const profiles = Array.from({ length: STRIPS }, (_, s) =>
        rowProfile(ink, width, height, Math.round(s * stripWidth), Math.round((s + 1) * stripWidth)),
    )

    const pitch = linePitch(rowProfile(ink, width, height, Math.round(width * 0.3), Math.round(width * 0.7)))
    // Lines can't drift more than half a line between neighbouring strips without ambiguity
    const maxShift = Math.max(2, Math.floor(pitch * 0.45))
    const bandHeight = height / BANDS

    // Relative shift between strip s and s + 1, per band
    const relative = Array.from({ length: STRIPS - 1 }, (_, s) =>
        fillGaps(
            Array.from({ length: BANDS }, (_, band) => {
                const y0 = Math.round(Math.max(0, (band - 0.5) * bandHeight))
                const y1 = Math.round(Math.min(height, (band + 1.5) * bandHeight))
                return bestShift(profiles[s], profiles[s + 1], y0, y1, maxShift)
            }),
        ),
    )

    // Chain outward from the middle strip
    const middle = Math.floor(STRIPS / 2)
    const offsets: number[][] = Array.from({ length: STRIPS }, () => new Array(BANDS).fill(0))
    for (let s = middle + 1; s < STRIPS; s++) {
        offsets[s] = offsets[s - 1].map((value, band) => value + relative[s - 1][band])
    }
    for (let s = middle - 1; s >= 0; s--) {
        offsets[s] = offsets[s + 1].map((value, band) => value - relative[s][band])
    }

    return { offsets, pitch }
}

/** Straightens curved text lines in a grayscale image */
export function dewarp(image: ImageData): ImageData {
    const { width, height, data } = image
    const { offsets } = curlOffsets(image)
    const stripWidth = width / STRIPS
    const bandHeight = height / BANDS
    const out = new ImageData(width, height)
    const d = out.data

    // Bilinear interpolation of the offset grid, clamped at the edges
    const offsetAt = (x: number, y: number) => {
        const sx = Math.min(STRIPS - 1, Math.max(0, x / stripWidth - 0.5))
        const by = Math.min(BANDS - 1, Math.max(0, y / bandHeight - 0.5))
        const s0 = Math.floor(sx)
        const b0 = Math.floor(by)
        const s1 = Math.min(STRIPS - 1, s0 + 1)
        const b1 = Math.min(BANDS - 1, b0 + 1)
        const fs = sx - s0
        const fb = by - b0
        const top = offsets[s0][b0] * (1 - fs) + offsets[s1][b0] * fs
        const bottom = offsets[s0][b1] * (1 - fs) + offsets[s1][b1] * fs
        return top * (1 - fb) + bottom * fb
    }

    for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
            const sy = y + offsetAt(x, y)
            const y0 = Math.floor(sy)
            const f = sy - y0
            const o = (y * width + x) * 4
            let value = 255
            if (y0 >= 0 && y0 < height - 1) {
                value = data[(y0 * width + x) * 4] * (1 - f) + data[((y0 + 1) * width + x) * 4] * f
            }
            d[o] = d[o + 1] = d[o + 2] = value
            d[o + 3] = 255
        }
    }

    return out
}
