import './styles.css'
import { recognize, warmUp } from './ocr'
import { formatGrade, level } from './readability'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const photoInput = $<HTMLInputElement>('photo-input')
const preview = $<HTMLElement>('preview')
const previewImage = $<HTMLImageElement>('preview-image')
const progress = $<HTMLElement>('progress')
const progressBar = $<HTMLProgressElement>('progress-bar')
const progressLabel = $<HTMLElement>('progress-label')
const textInput = $<HTMLTextAreaElement>('text')
const empty = $<HTMLElement>('empty')
const result = $<HTMLElement>('result')
const offlineStatus = $<HTMLElement>('offline-status')

const STATUS_LABELS: Record<string, string> = {
    'loading tesseract core': 'Loading scanner…',
    'initializing tesseract': 'Loading scanner…',
    'loading language traineddata': 'Loading English…',
    'initializing api': 'Loading scanner…',
    'recognizing text': 'Reading text…',
}

function showProgress(status: string, value: number) {
    progress.hidden = false
    progressBar.value = value
    progressLabel.textContent = STATUS_LABELS[status] ?? 'Working…'
}

/** Join OCR's hard-wrapped lines back into paragraphs */
function unwrapLines(text: string): string {
    return text
        .trim()
        .split(/\n\s*\n/)
        .map((paragraph) => paragraph.replace(/(\w)-\n(\w)/g, '$1$2').replace(/\s*\n\s*/g, ' '))
        .join('\n\n')
}

photoInput.addEventListener('change', async () => {
    const file = photoInput.files?.[0]
    if (!file) return

    URL.revokeObjectURL(previewImage.src)
    previewImage.src = URL.createObjectURL(file)
    preview.hidden = false
    showProgress('', 0)

    try {
        const text = await recognize(file, showProgress)
        textInput.value = unwrapLines(text)
        render()
        if (!text.trim()) {
            progressLabel.textContent = 'No text found. Try a closer, sharper photo.'
            return
        }
        progress.hidden = true
    } catch (error) {
        console.error(error)
        progressLabel.textContent = 'Sorry, the page could not be read. Please try again.'
    } finally {
        photoInput.value = ''
    }
})

function render() {
    const levelled = level(textInput.value)
    empty.hidden = Boolean(levelled)
    result.hidden = !levelled
    if (!levelled) return

    $('grade').textContent = formatGrade(levelled.grade)
    $('guided').textContent = levelled.guidedReading
    $('lexile').textContent = levelled.lexile

    $('warnings').replaceChildren(
        ...levelled.warnings.map((warning) => Object.assign(document.createElement('li'), { textContent: warning })),
    )

    $('formulas').replaceChildren(
        ...levelled.formulas.map((formula) => {
            const row = document.createElement('tr')
            row.classList.toggle('excluded', !formula.inConsensus)
            const name = document.createElement('td')
            name.textContent = formula.name
            const grade = document.createElement('td')
            grade.textContent = formula.note ?? formula.grade.toFixed(1)
            row.append(name, grade)
            return row
        }),
    )

    const { words, sentences, syllables } = levelled.stats
    $('stats').textContent =
        `${words} words · ${sentences} sentences · ${(syllables / words).toFixed(2)} syllables per word · ` +
        `Flesch reading ease ${levelled.fleschReadingEase.toFixed(0)}`
}

let renderTimer: number | undefined
textInput.addEventListener('input', () => {
    clearTimeout(renderTimer)
    renderTimer = window.setTimeout(render, 250)
})

/** Resolves once a service worker controls this page, so the OCR files it loads get cached */
function waitForController(): Promise<void> {
    if (navigator.serviceWorker.controller) return Promise.resolve()
    return new Promise((resolve) =>
        navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }),
    )
}

async function setUpOffline() {
    if (import.meta.env.DEV || !('serviceWorker' in navigator)) {
        offlineStatus.textContent = import.meta.env.DEV ? 'Offline mode is off in development' : ''
        warmUp()
        return
    }
    try {
        await navigator.serviceWorker.register('./sw.js')
        await waitForController()
        warmUp()
        offlineStatus.textContent = 'Ready to work offline'
    } catch (error) {
        console.warn('Service worker registration failed', error)
        offlineStatus.textContent = ''
        warmUp()
    }
}

setUpOffline()
