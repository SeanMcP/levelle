// Tidies Tesseract's raw output into readable paragraphs.

/** Symbols that page edges, the gutter and specks turn into at the ends of lines */
const EDGE_JUNK = /^[ \t|\\[\]{}©®¢«»~_=+*#@]+|[ \t|\\[\]{}©®¢«»~_=+*#@]+$/gm

export function cleanOcrText(text: string): string {
    return (
        text
            .replace(EDGE_JUNK, '')
            // Tesseract often reads a lowercase i as 1 ("1s", "1t", "1n"); leave ordinals like 1st
            .replace(/\b1(?!st\b|nd\b|rd\b|th\b)(?=[a-z]+\b)/g, 'i')
            .trim()
            // Join hard-wrapped lines (and hyphenated words) back into paragraphs
            .split(/\n[ \t]*\n/)
            .map((paragraph) => paragraph.replace(/(\w)-\n(\w)/g, '$1$2').replace(/\s*\n\s*/g, ' '))
            .filter(Boolean)
            .join('\n\n')
    )
}
