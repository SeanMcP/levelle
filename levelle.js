console.log('📖 Hello from Levelle!')

const video = document.getElementById('videoRef')
const errors = document.getElementById('errorsRef')

function logError(err) {
    console.error(err)
    errors.textContent = JSON.stringify(err, null, 2)
}

async function startStream() {
    if (video && navigator.mediaDevices.getUserMedia) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: true
                // video: {
                //     facingMode: { exact: 'environment' }
                // }
            })
            video.srcObject = stream
            readStream()
        } catch (err) {
            logError(err)
        }
    }
}

function stopStream() {
    if (video.srcObject) {
        const tracks = video.srcObject.getTracks()

        for (let i = 0; i < tracks.length; i++) {
            tracks[i].stop()
        }

        video.srcObject = null
    }
}

function readStream() {
    if (window.Tesseract) {
        const { TesseractWorker } = window.Tesseract
        const worker = new TesseractWorker()

        worker
            .recognize(video)
            .progress(progress => {
                console.log('progress', progress)
            })
            .then(result => {
                console.clear()
                console.log('result', result)
            })
    }
}
