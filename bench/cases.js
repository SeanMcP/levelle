// Photos to benchmark. `corners` are where a reader would drag the handles
// (fractions of the image: top-left, top-right, bottom-right, bottom-left),
// just outside the main text block. `truth` is a hand transcription; any
// <...> marks text that can't be seen (e.g. under a finger) and is skipped.
export const cases = [
    {
        image: 'data/scan-1.jpg',
        truth: 'data/scan-1.txt',
        corners: [[0.166, 0.1], [0.877, 0.075], [0.904, 0.958], [0.133, 0.95]],
    },
    {
        image: 'data/scan-2.jpg',
        truth: 'data/scan-2.txt',
        corners: [[0.177, 0.088], [0.855, 0.033], [0.849, 0.958], [0.094, 0.9]],
    },
    {
        image: 'data/scan-3.jpg',
        truth: 'data/scan-3.txt',
        corners: [[0.222, 0.142], [0.843, 0.146], [0.827, 0.917], [0.1, 0.908]],
    },
    {
        image: 'data/scan-4.jpg',
        truth: 'data/scan-4.txt',
        corners: [[0.205, 0.117], [0.855, 0.108], [0.843, 0.946], [0.128, 0.938]],
    },
]
