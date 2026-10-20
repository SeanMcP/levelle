// Lets the reader drag four corner handles around the passage on a photo.
// Corners are stored as fractions of the image size (0–1).
import type { Point, Quad } from './image'

const SVG = 'http://www.w3.org/2000/svg'
const INSET = 0.08
/** Visible handle radius in CSS pixels */
const HANDLE_RADIUS = 12
/** How close (CSS px) a touch must land to grab a corner; fingertips are imprecise */
const GRAB_RADIUS = 44
/** Magnifier size (CSS px) and zoom */
const LOUPE_SIZE = 120
const LOUPE_ZOOM = 2.5

export function defaultQuad(): Quad {
    return [
        [INSET, INSET],
        [1 - INSET, INSET],
        [1 - INSET, 1 - INSET],
        [INSET, 1 - INSET],
    ]
}

export class CornerEditor {
    quad: Quad = defaultQuad()
    private svg: SVGSVGElement
    private polygon: SVGPolygonElement
    private handles: SVGGElement[]
    private loupe: HTMLCanvasElement
    private dragging: { index: number; offset: Point; pointerId: number } | null = null

    constructor(private image: HTMLImageElement) {
        image.draggable = false

        this.svg = document.createElementNS(SVG, 'svg')
        this.svg.classList.add('corners')
        this.polygon = document.createElementNS(SVG, 'polygon')
        this.svg.append(this.polygon)

        this.handles = this.quad.map(() => {
            const group = document.createElementNS(SVG, 'g')
            group.classList.add('handle')
            const ring = document.createElementNS(SVG, 'circle')
            const dot = document.createElementNS(SVG, 'circle')
            dot.classList.add('dot')
            group.append(ring, dot)
            this.svg.append(group)
            return group
        })

        this.loupe = document.createElement('canvas')
        this.loupe.className = 'loupe'
        this.loupe.hidden = true

        image.after(this.svg, this.loupe)
        image.addEventListener('load', () => this.reset())
        new ResizeObserver(() => this.render()).observe(image)

        // Listen on the whole overlay (which has touch-action: none) so the
        // browser never turns a drag into a page scroll
        this.svg.addEventListener('pointerdown', (event) => this.start(event))
        this.svg.addEventListener('pointermove', (event) => this.move(event))
        this.svg.addEventListener('pointerup', (event) => this.end(event))
        this.svg.addEventListener('pointercancel', (event) => this.end(event))
    }

    reset() {
        this.quad = defaultQuad()
        this.render()
    }

    /** Pointer position relative to the image, in CSS pixels */
    private position(event: PointerEvent): Point {
        const rect = this.image.getBoundingClientRect()
        return [event.clientX - rect.left, event.clientY - rect.top]
    }

    private start(event: PointerEvent) {
        if (this.dragging) return
        const rect = this.image.getBoundingClientRect()
        const [px, py] = this.position(event)

        let nearest = -1
        let nearestDistance = GRAB_RADIUS
        this.quad.forEach(([x, y], index) => {
            const distance = Math.hypot(x * rect.width - px, y * rect.height - py)
            if (distance <= nearestDistance) {
                nearest = index
                nearestDistance = distance
            }
        })
        if (nearest < 0) return

        event.preventDefault()
        this.svg.setPointerCapture(event.pointerId)
        const [x, y] = this.quad[nearest]
        // Keep the corner where it is relative to the finger, so it doesn't jump
        this.dragging = {
            index: nearest,
            offset: [x * rect.width - px, y * rect.height - py],
            pointerId: event.pointerId,
        }
        this.handles[nearest].classList.add('active')
        this.showLoupe()
    }

    private move(event: PointerEvent) {
        if (!this.dragging || event.pointerId !== this.dragging.pointerId) return
        event.preventDefault()
        const rect = this.image.getBoundingClientRect()
        const [px, py] = this.position(event)
        const [ox, oy] = this.dragging.offset
        const clamp = (value: number) => Math.min(1, Math.max(0, value))
        this.quad[this.dragging.index] = [clamp((px + ox) / rect.width), clamp((py + oy) / rect.height)]
        this.render()
        this.showLoupe()
    }

    private end(event: PointerEvent) {
        if (!this.dragging || event.pointerId !== this.dragging.pointerId) return
        this.handles[this.dragging.index].classList.remove('active')
        this.dragging = null
        this.loupe.hidden = true
    }

    /** Magnified view of the dragged corner, shown above it (or below near the top) */
    private showLoupe() {
        if (!this.dragging) return
        const rect = this.image.getBoundingClientRect()
        const { naturalWidth: w, naturalHeight: h } = this.image
        const [x, y] = this.quad[this.dragging.index]
        const cssX = x * rect.width
        const cssY = y * rect.height

        const ratio = window.devicePixelRatio || 1
        const pixels = Math.round(LOUPE_SIZE * ratio)
        if (this.loupe.width !== pixels) {
            this.loupe.width = this.loupe.height = pixels
            this.loupe.style.width = this.loupe.style.height = `${LOUPE_SIZE}px`
        }

        const context = this.loupe.getContext('2d')!
        const span = ((LOUPE_SIZE / LOUPE_ZOOM) * w) / rect.width
        context.fillStyle = '#000'
        context.fillRect(0, 0, pixels, pixels)
        context.drawImage(this.image, x * w - span / 2, y * h - span / 2, span, span, 0, 0, pixels, pixels)

        // Crosshair at the corner
        const middle = pixels / 2
        context.strokeStyle = 'rgb(255 255 255 / 0.9)'
        context.lineWidth = 3 * ratio
        context.beginPath()
        context.moveTo(middle - 14 * ratio, middle)
        context.lineTo(middle + 14 * ratio, middle)
        context.moveTo(middle, middle - 14 * ratio)
        context.lineTo(middle, middle + 14 * ratio)
        context.stroke()
        context.strokeStyle = '#2f5d50'
        context.lineWidth = 1.5 * ratio
        context.stroke()

        // Sit clear of the finger: above the corner, or below it when there's no room
        const gap = 56
        const above = cssY - gap - LOUPE_SIZE
        const top = above >= -rect.top + 8 ? above : cssY + gap
        const left = Math.min(rect.width - LOUPE_SIZE / 2, Math.max(LOUPE_SIZE / 2, cssX)) - LOUPE_SIZE / 2
        this.loupe.style.transform = `translate(${left}px, ${top}px)`
        this.loupe.hidden = false
    }

    /** Draws in the image's own pixel space so the overlay scales uniformly with it */
    private render() {
        const { naturalWidth: w, naturalHeight: h } = this.image
        const displayed = this.image.getBoundingClientRect().width
        if (!w || !h || !displayed) return

        const scale = w / displayed
        this.svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
        this.svg.style.setProperty('--stroke', `${2 * scale}px`)
        this.polygon.setAttribute('points', this.quad.map(([x, y]) => `${x * w},${y * h}`).join(' '))
        this.handles.forEach((handle, index) => {
            const [x, y] = this.quad[index]
            const [ring, dot] = handle.children
            for (const circle of [ring, dot]) {
                circle.setAttribute('cx', String(x * w))
                circle.setAttribute('cy', String(y * h))
            }
            ring.setAttribute('r', String(HANDLE_RADIUS * scale))
            dot.setAttribute('r', String(2.5 * scale))
        })
    }
}
