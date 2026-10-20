// Lets the reader drag four corner handles around the passage on a photo.
// Corners are stored as fractions of the image size (0–1).
import type { Quad } from './image'

const SVG = 'http://www.w3.org/2000/svg'
const INSET = 0.08
/** On-screen handle radius in CSS pixels; big enough for a fingertip */
const HANDLE_RADIUS = 18

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
    private handles: SVGCircleElement[]

    constructor(private image: HTMLImageElement) {
        this.svg = document.createElementNS(SVG, 'svg')
        this.svg.classList.add('corners')
        this.polygon = document.createElementNS(SVG, 'polygon')
        this.svg.append(this.polygon)

        this.handles = this.quad.map((_, index) => {
            const handle = document.createElementNS(SVG, 'circle')
            handle.classList.add('handle')
            handle.addEventListener('pointerdown', (event) => this.drag(event, index))
            this.svg.append(handle)
            return handle
        })

        image.insertAdjacentElement('afterend', this.svg)
        image.addEventListener('load', () => this.reset())
        new ResizeObserver(() => this.render()).observe(image)
    }

    reset() {
        this.quad = defaultQuad()
        this.render()
    }

    private drag(event: PointerEvent, index: number) {
        event.preventDefault()
        const handle = this.handles[index]
        handle.setPointerCapture(event.pointerId)

        const move = (moveEvent: PointerEvent) => {
            const rect = this.image.getBoundingClientRect()
            const clamp = (value: number) => Math.min(1, Math.max(0, value))
            this.quad[index] = [
                clamp((moveEvent.clientX - rect.left) / rect.width),
                clamp((moveEvent.clientY - rect.top) / rect.height),
            ]
            this.render()
        }
        const end = () => {
            handle.removeEventListener('pointermove', move)
            handle.removeEventListener('pointerup', end)
            handle.removeEventListener('pointercancel', end)
        }

        handle.addEventListener('pointermove', move)
        handle.addEventListener('pointerup', end)
        handle.addEventListener('pointercancel', end)
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
            handle.setAttribute('cx', String(x * w))
            handle.setAttribute('cy', String(y * h))
            handle.setAttribute('r', String(HANDLE_RADIUS * scale))
        })
    }
}
