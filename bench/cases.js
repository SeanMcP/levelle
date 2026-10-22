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
    // The Sum of Saving Knowledge (a modernized edition). l = left-hand page, r = right-hand page
    {
        image: 'data/scan-l-1.jpg',
        truth: 'data/scan-l-1.txt',
        corners: [[0.162, 0.06], [0.8, 0.125], [0.799, 0.944], [0.133, 0.941]],
    },
    {
        image: 'data/scan-l-2.jpg',
        truth: 'data/scan-l-2.txt',
        corners: [[0.205, 0.12], [0.81, 0.17], [0.815, 0.94], [0.196, 0.915]],
    },
    {
        image: 'data/scan-r-1.jpg',
        truth: 'data/scan-r-1.txt',
        corners: [[0.15, 0.094], [0.787, 0.084], [0.795, 0.909], [0.133, 0.916]],
    },
    {
        image: 'data/scan-r-2.jpg',
        truth: 'data/scan-r-2.txt',
        corners: [[0.167, 0.163], [0.841, 0.163], [0.866, 0.894], [0.129, 0.894]],
    },
]
