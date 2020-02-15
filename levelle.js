const { createWorker } = require('tesseract.js')
console.log('📖 Hello from Levelle!');

function Worker() {
    return createWorker({
        logger: message => console.log(message)
    });
}

let width = 320
let height
let isStreaming = false

const canvas = document.getElementById('canvasRef')
const photo = document.getElementById('photoRef')
const video = document.getElementById('videoRef')
const errors = document.getElementById('errorsRef')

document.getElementById('startButtonRef').addEventListener('click', startStream)
document.getElementById('stopButtonRef').addEventListener('click', stopStream)
document.getElementById('pictureButtonRef').addEventListener('click', takePicture)

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
            video.play()
        } catch (err) {
            logError(err)
        }
    }
}

video.addEventListener('canplay', () => {
    if (!isStreaming) {
        height = video.videoHeight / (video.videoWidth / width);

        video.setAttribute('width', width);
        video.setAttribute('height', height);
        canvas.setAttribute('width', width);
        canvas.setAttribute('height', height);
        isStreaming = true;
    }
})

function stopStream() {
    if (video.srcObject) {
        const tracks = video.srcObject.getTracks()

        for (let i = 0; i < tracks.length; i++) {
            tracks[i].stop()
        }

        video.srcObject = null
    }
}

async function readStream() {
    await worker.load();
    await worker.loadLanguage('eng');
    await worker.initialize('eng');
    const { data: { text } } = await worker.recognize('https://tesseract.projectnaptha.com/img/eng_bw.png');
    console.log(text);
    await worker.terminate();
}

async function readPhoto(image) {
    const worker = Worker()

    await worker.load();
    await worker.loadLanguage('eng');
    await worker.initialize('eng');
    const { data: { text } } = await worker.recognize(image);
    console.log(text);
    await worker.terminate();
}

function takePicture() {
    const context = canvas.getContext('2d');
    if (width && height) {
        canvas.width = width;
        canvas.height = height;
        context.drawImage(video, 0, 0, width, height);

        const data = canvas.toDataURL('image/png');
        photo.setAttribute('src', data);
        readPhoto(data)

    } else {
        clearPicture()
    }
}

function clearPicture() {
    const context = canvas.getContext('2d');
    context.fillStyle = "#AAA";
    context.fillRect(0, 0, canvas.width, canvas.height);

    const data = canvas.toDataURL('image/png');
    photo.setAttribute('src', data);
}