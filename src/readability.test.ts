import { describe, expect, it } from 'vitest'
import { cleanText, getStats, level, toGuidedReading, toLexile } from './readability'

const EARLY_READER =
    'I see a cat. The cat is big. The cat can run. I like the cat. ' +
    'The cat sees a dog. The dog is red. The dog can jump. Run, cat, run! ' +
    'The cat and the dog play. We like to play too. Look at the cat go. The dog is fun.'

const CHAPTER_BOOK =
    'Wilbur did not want food, he wanted love. He wanted a friend, someone who would play with him. ' +
    'He mentioned this to the goose, who was sitting quietly in a corner of the sheepfold. ' +
    'The goose said that she could not play because she was sitting on her eggs. ' +
    'Wilbur walked slowly to the barn door and looked out at the gray sky. ' +
    'It was still raining, and the rain made long puddles in the yard.'

const ACADEMIC =
    'The constitutional framework established a deliberately complicated separation of governmental ' +
    'authority, distributing legislative, executive, and judicial responsibilities among institutions ' +
    'whose competing prerogatives were intended to prevent the concentration of power. Consequently, ' +
    'interpretations of jurisdictional boundaries have generated considerable controversy throughout ' +
    'subsequent generations of political philosophers and practitioners.'

describe('cleanText', () => {
    it('joins hyphenated line breaks and collapses whitespace', () => {
        expect(cleanText('The ele-\nphant  walked\n\nhome.')).toBe('The elephant walked home.')
    })
})

describe('getStats', () => {
    it('counts sentences, words and syllables', () => {
        const stats = getStats('The cat sat. A happy dog ran away!')
        expect(stats.sentences).toBe(2)
        expect(stats.words).toBe(8)
        expect(stats.syllables).toBe(10)
    })

    it('does not split on abbreviations inside quotes oddly', () => {
        expect(getStats('"Stop!" she said. He stopped.').sentences).toBe(3)
    })
})

describe('level', () => {
    it('returns null for empty text', () => {
        expect(level('   ')).toBeNull()
    })

    it('orders passages by difficulty', () => {
        const early = level(EARLY_READER)!
        const chapter = level(CHAPTER_BOOK)!
        const academic = level(ACADEMIC)!

        expect(early.grade).toBeLessThan(2)
        expect(chapter.grade).toBeGreaterThan(early.grade)
        expect(chapter.grade).toBeLessThan(8)
        expect(academic.grade).toBeGreaterThan(12)
    })

    it('warns about short passages', () => {
        expect(level(EARLY_READER)!.warnings).toHaveLength(1)
    })
})

describe('scale conversions', () => {
    it('maps grades to guided reading letters', () => {
        expect(toGuidedReading(0)).toBe('A')
        expect(toGuidedReading(1.5)).toBe('G')
        expect(toGuidedReading(3.1)).toBe('N')
        expect(toGuidedReading(12)).toBe('Z')
    })

    it('maps grades to lexile bands', () => {
        expect(toLexile(-1)).toBe('BR–230L')
        expect(toLexile(4.9)).toBe('740L–940L')
        expect(toLexile(16)).toBe('1185L–1385L')
    })
})
