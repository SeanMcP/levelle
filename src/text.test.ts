import { describe, expect, it } from 'vitest'
import { cleanOcrText } from './text'

describe('cleanOcrText', () => {
    it('joins wrapped lines and hyphenated words', () => {
        expect(cleanOcrText('The ele-\nphant walked\nhome.\n\nNext one.')).toBe('The elephant walked home.\n\nNext one.')
    })

    it('strips page-edge junk from line ends', () => {
        expect(cleanOcrText('| When Mary |\n\\ clothing. Many\n© Nature never ]')).toBe(
            'When Mary clothing. Many Nature never',
        )
    })

    it('fixes 1 read for a lowercase i', () => {
        expect(cleanOcrText('he 1s being. Have 1t your way 1n 1st place on page 18.')).toBe(
            'he is being. Have it your way in 1st place on page 18.',
        )
    })
})
