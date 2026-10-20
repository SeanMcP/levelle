import { syllable } from 'syllable'
import { daleChall } from 'dale-chall'
import { spache } from 'spache'

const daleChallWords = new Set(daleChall.map((word) => word.toLowerCase()))
const spacheWords = new Set(spache.map((word) => word.toLowerCase()))

export interface TextStats {
    sentences: number
    words: number
    letters: number
    syllables: number
    polysyllables: number
    daleChallUnfamiliar: number
    spacheUnfamiliar: number
}

export interface FormulaResult {
    name: string
    grade: number
    /** Formulas only valid for part of the grade range are left out of the consensus */
    inConsensus: boolean
    note?: string
}

export interface LevelResult {
    stats: TextStats
    fleschReadingEase: number
    formulas: FormulaResult[]
    grade: number
    guidedReading: string
    lexile: string
    warnings: string[]
}

interface Token {
    word: string
    startsSentence: boolean
}

/** Undo common OCR/print artifacts: hyphenated line breaks, hard wraps, curly quotes */
export function cleanText(text: string): string {
    return text
        .replace(/[‘’]/g, "'")
        .replace(/[“”]/g, '"')
        .replace(/(\w)-\s*\n\s*(\w)/g, '$1$2')
        .replace(/\s+/g, ' ')
        .trim()
}

function tokenize(text: string): { tokens: Token[]; sentences: number } {
    const chunks = text
        .split(/(?<=[.!?]+["')\]]*)\s+/)
        .map((chunk) => chunk.trim())
        .filter((chunk) => /[A-Za-z]/.test(chunk))

    const tokens: Token[] = []
    for (const chunk of chunks) {
        const words = chunk.match(/[A-Za-z]+(?:'[A-Za-z]+)*/g) ?? []
        words.forEach((word, index) => tokens.push({ word, startsSentence: index === 0 }))
    }

    return { tokens, sentences: chunks.length }
}

/** Looks a word up in a familiar-word list, allowing regular inflections */
function isFamiliar(token: Token, list: Set<string>): boolean {
    const word = token.word.toLowerCase().replace(/'s$/, '')

    // Capitalized mid-sentence words are probably names, which both formulas treat as familiar
    if (!token.startsSentence && /^[A-Z]/.test(token.word)) return true
    if (list.has(word)) return true

    const stems = [
        word.replace(/s$/, ''),
        word.replace(/es$/, ''),
        word.replace(/ies$/, 'y'),
        word.replace(/ed$/, ''),
        word.replace(/d$/, ''),
        word.replace(/ing$/, ''),
        word.replace(/ing$/, 'e'),
        word.replace(/ly$/, ''),
        word.replace(/(\w)\1(ed|ing)$/, '$1'),
    ]
    return stems.some((stem) => stem !== word && list.has(stem))
}

export function getStats(text: string): TextStats {
    const { tokens, sentences } = tokenize(cleanText(text))

    const stats: TextStats = {
        sentences,
        words: tokens.length,
        letters: 0,
        syllables: 0,
        polysyllables: 0,
        daleChallUnfamiliar: 0,
        spacheUnfamiliar: 0,
    }

    // Spache counts each unfamiliar word once; Dale-Chall counts every occurrence
    const spacheSeen = new Set<string>()

    for (const token of tokens) {
        const count = syllable(token.word)
        stats.letters += token.word.replace(/'/g, '').length
        stats.syllables += count
        if (count >= 3) stats.polysyllables++
        if (!isFamiliar(token, daleChallWords)) stats.daleChallUnfamiliar++

        const lower = token.word.toLowerCase()
        if (!isFamiliar(token, spacheWords) && !spacheSeen.has(lower)) {
            spacheSeen.add(lower)
            stats.spacheUnfamiliar++
        }
    }

    return stats
}

/** New Dale-Chall scores map to grade bands; use the middle of each band */
function daleChallGrade(score: number): number {
    if (score < 5) return 4
    if (score < 6) return 5.5
    if (score < 7) return 7.5
    if (score < 8) return 9.5
    if (score < 9) return 11.5
    if (score < 10) return 14
    return 16
}

function median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b)
    const middle = Math.floor(sorted.length / 2)
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

// Approximate Fountas & Pinnell letters by the grade where each is typically read.
// Commonly published correlation charts; not an official F&P level.
const GUIDED_READING: [grade: number, letter: string][] = [
    [0, 'A'], [0.25, 'B'], [0.5, 'C'], [0.75, 'D'],
    [1, 'E'], [1.2, 'F'], [1.4, 'G'], [1.6, 'H'], [1.8, 'I'], [1.9, 'J'],
    [2, 'K'], [2.33, 'L'], [2.67, 'M'],
    [3, 'N'], [3.33, 'O'], [3.67, 'P'],
    [4, 'Q'], [4.33, 'R'], [4.67, 'S'],
    [5, 'T'], [5.33, 'U'], [5.67, 'V'],
    [6, 'W'], [6.33, 'X'], [6.67, 'Y'],
    [7, 'Z'],
]

export function toGuidedReading(grade: number): string {
    let letter = GUIDED_READING[0][1]
    for (const [min, value] of GUIDED_READING) {
        if (grade >= min) letter = value
    }
    return letter
}

// Typical mid-year Lexile reader ranges by grade (K–12). Lexile is a
// MetaMetrics trademark; this is a rough estimate, not a Lexile measure.
const LEXILE_BANDS = [
    'BR–230L', '190L–530L', '420L–650L', '520L–820L', '740L–940L',
    '830L–1010L', '925L–1070L', '970L–1120L', '1010L–1185L', '1050L–1260L',
    '1080L–1335L', '1185L–1385L', '1185L–1385L',
]

export function toLexile(grade: number): string {
    const index = Math.min(LEXILE_BANDS.length - 1, Math.max(0, Math.floor(grade)))
    return LEXILE_BANDS[index]
}

export function level(text: string): LevelResult | null {
    const stats = getStats(text)
    const { words, sentences, letters, syllables, polysyllables } = stats
    if (words === 0 || sentences === 0) return null

    const wordsPerSentence = words / sentences
    const syllablesPerWord = syllables / words
    const lettersPer100 = (letters / words) * 100
    const sentencesPer100 = (sentences / words) * 100
    const daleChallPercent = (stats.daleChallUnfamiliar / words) * 100
    const spachePercent = (stats.spacheUnfamiliar / words) * 100

    const daleChallScore =
        0.1579 * daleChallPercent + 0.0496 * wordsPerSentence + (daleChallPercent > 5 ? 3.6365 : 0)
    const spacheGrade = 0.121 * wordsPerSentence + 0.082 * spachePercent + 0.659

    const formulas: FormulaResult[] = [
        {
            name: 'Flesch-Kincaid',
            grade: 0.39 * wordsPerSentence + 11.8 * syllablesPerWord - 15.59,
            inConsensus: true,
        },
        {
            name: 'Coleman-Liau',
            grade: 0.0588 * lettersPer100 - 0.296 * sentencesPer100 - 15.8,
            inConsensus: true,
        },
        {
            name: 'Automated Readability',
            grade: 4.71 * (letters / words) + 0.5 * wordsPerSentence - 21.43,
            inConsensus: true,
        },
        {
            name: 'Gunning Fog',
            grade: 0.4 * (wordsPerSentence + 100 * (polysyllables / words)),
            inConsensus: true,
        },
        {
            name: 'SMOG',
            grade: 1.043 * Math.sqrt(polysyllables * (30 / sentences)) + 3.1291,
            inConsensus: sentences >= 10,
            note: sentences < 10 ? 'Needs 10+ sentences' : undefined,
        },
        {
            name: 'Dale-Chall',
            grade: daleChallGrade(daleChallScore),
            inConsensus: daleChallScore >= 5,
            note: daleChallScore < 5 ? 'Grade 4 or below' : undefined,
        },
        {
            name: 'Spache',
            grade: spacheGrade,
            inConsensus: spacheGrade < 4,
            note: spacheGrade >= 4 ? 'Only for grades 1–3' : undefined,
        },
    ]

    const grade = Math.min(16, Math.max(0, median(formulas.filter((f) => f.inConsensus).map((f) => f.grade))))

    const warnings: string[] = []
    if (words < 100) {
        warnings.push(`Only ${words} words. Results are more reliable with 100 or more.`)
    }

    return {
        stats,
        fleschReadingEase: 206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord,
        formulas,
        grade,
        guidedReading: toGuidedReading(grade),
        lexile: toLexile(grade),
        warnings,
    }
}

export function formatGrade(grade: number): string {
    if (grade < 1) return 'Kindergarten'
    if (grade >= 13) return 'College'
    return `Grade ${grade.toFixed(1)}`
}
