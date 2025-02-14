import { GestureRecognizer, FilesetResolver, DrawingUtils } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";

// Initialize the loading overlay
import { initializeLoadingOverlay } from "/static/js/loading.js";

initializeLoadingOverlay();
showLoadingOverlay(); // Display the overlay while loading

let gestureRecognizer;
let runningMode = "IMAGE";  // Initial mode set to image-based recognition
let enableWebcamButton;
let webcamRunning = false;
const videoElement = document.getElementById("webcam");
const canvasElement = document.getElementById("output_canvas");
const canvasCtx = canvasElement.getContext("2d");
const latestGestureOutput = document.getElementById("latest-gesture");
const accumulatedGesturesOutput = document.getElementById("accumulated-gestures");
const predictedWordOutput = document.getElementById("predicted-word");  // Display predicted word
enableWebcamButton = document.getElementById("webcamButton");
const cameraSelect = document.getElementById("cameraSelect");
const clearButton = document.getElementById("clearButton");  // Clear button functionality
let currentStream;

let context = ""; // Stores accumulated context
let currentWord = ""; // Current word being written
let gestureCaptureTimeout = null;
let currentGesture = null;

const speedSlider = document.getElementById('speedSlider');
const speedValue = document.getElementById('speedValue');
const accuracySlider = document.getElementById('accuracySlider');
const accuracyValue = document.getElementById('accuracyValue');

let waitTime;
let CONFIDENCE_THRESHOLD;

// Update Speed and Accuracy based on slider values
function updateSpeed() {
    const sliderValue = parseInt(speedSlider.value);
    const seconds = 0.5 + (sliderValue / 100) * 4.5;  // Convert slider value to seconds
    waitTime = parseFloat(seconds.toFixed(2));
    speedValue.textContent = `${seconds.toFixed(2)}sec`;
}

function updateAccuracy() {
    const sliderValue = parseInt(accuracySlider.value);
    CONFIDENCE_THRESHOLD = parseFloat((sliderValue / 100).toFixed(2));
    accuracyValue.textContent = `${sliderValue}%`;
}

speedSlider.addEventListener('input', updateSpeed);
accuracySlider.addEventListener('input', updateAccuracy);

updateSpeed();
updateAccuracy();

// Mapping gesture categories to Arabic letters or actions
const gestureToLetterMap = {
    'ain': 'ع',
    'al': 'go',   
    'aleff': 'ا',
    'bb': 'ب',
    'dal': 'د',
    'dha': 'ذ',
    'dhad': 'ض',
    'fa': 'ف',
    'gaaf': 'ق',
    'ghain': 'غ',
    'ha': 'ح',
    'haa': 'ه',
    'jeem': 'ج',
    'kaaf': 'ك',
    'khaa': 'خ',
    'la': 'ل',
    'laam': 'ل',
    'meem': 'م',
    'nun': 'ن',
    'ra': 'ر',
    'saad': 'ص',
    'seen': 'س',
    'sheen': 'ش',
    'ta': 'ت',
    'taa': 'ط',
    'thaa': 'ث',
    'thal': 'ظ',
    'toot': ' ',  // 'toot' maps to space
    'waw': 'و',
    'ya': 'ي',
    'yaa': 'ي',
    'zay': 'ز'
};

const confidenceWarning = document.getElementById("confidence-warning");

let boxSetting = document.querySelector('.box-Setting')
let closeBtn = document.querySelector('#closeBtn')
let settingMenu = document.querySelector('#settingMenu')
settingMenu.addEventListener('click', function () {
    if (boxSetting.classList.contains('d-none')) {
        boxSetting.classList.remove('d-none')
    }
})
closeBtn.addEventListener('click', function () {
    boxSetting.classList.add('d-none')
})

// Initialize the gesture recognizer
const createGestureRecognizer = async () => {
    try {
        const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
        );
        gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: "/static/moe_ar_sign_language_model.task", 
                delegate: "GPU"
            },
            runningMode: runningMode
        });

        await getCameras();  // Get available cameras
        hideLoadingOverlay();  // Hide loading overlay after setup
    } catch (error) {
        console.error("Error initializing GestureRecognizer:", error);
        showErrorOverlay("Failed to load AI model. Please try again later.");
    }
};

createGestureRecognizer();

// Check if the browser supports webcam access
function hasGetUserMedia() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

// Get available camera devices and populate the dropdown
async function getCameras() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === "videoinput");
        cameraSelect.innerHTML = ""; // Clear any existing options
        videoDevices.forEach((device, index) => {
            const option = document.createElement("option");
            option.value = device.deviceId;
            option.text = device.label || `Camera ${index + 1}`;
            cameraSelect.appendChild(option);
        });
    } catch (error) {
        console.error("Error getting cameras:", error);
        showErrorOverlay("Failed to access camera devices.");
    }
}

// Enable webcam and start gesture detection
async function enableCam(event) {
    if (!gestureRecognizer) {
        alert("Please wait for the gesture recognizer to load");
        return;
    }

    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop()); // Stop previous stream
    }

    const constraints = {
        video: {
            deviceId: cameraSelect.value ? { exact: cameraSelect.value } : undefined
        }
    };

    try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        currentStream = stream;
        videoElement.srcObject = stream;

        videoElement.addEventListener("loadeddata", () => {
            webcamRunning = true;
            canvasElement.width = videoElement.videoWidth;
            canvasElement.height = videoElement.videoHeight;
            predictWebcam();  // Start gesture prediction
        }, { once: true });
    } catch (error) {
        console.error("Error accessing the camera:", error);
        showErrorOverlay("Failed to access the camera. Please check permissions.");
    }
}

// Process webcam input for gesture prediction
let lastVideoTime = -1;
let results = undefined;

async function predictWebcam() {
    if (!webcamRunning) return;

    if (runningMode === "IMAGE") {
        runningMode = "VIDEO";  // Switch to video mode
        await gestureRecognizer.setOptions({ runningMode: "VIDEO" });
    }

    let nowInMs = Date.now();
    if (videoElement.currentTime !== lastVideoTime) {
        lastVideoTime = videoElement.currentTime;
        try {
            results = gestureRecognizer.recognizeForVideo(videoElement, nowInMs);
        } catch (error) {
            console.error("Error during gesture recognition:", error);
            showErrorOverlay("Gesture recognition failed.");
            webcamRunning = false;
            return;
        }
    } else {
        window.requestAnimationFrame(predictWebcam);
        return;
    }

    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);  // Clear canvas

    // Draw landmarks and connectors
    if (results && results.landmarks) {
        const drawingUtils = new DrawingUtils(canvasCtx);
        for (const landmarks of results.landmarks) {
            drawingUtils.drawConnectors(landmarks, GestureRecognizer.HAND_CONNECTIONS, {
                color: "#191919",
                lineWidth: 3
            });
            drawingUtils.drawLandmarks(landmarks, {
                color: "#50c9d5",
                lineWidth: 1
            });
        }
    }

    if (results && results.gestures && results.gestures.length > 0) {
        const gesture = results.gestures[0][0];
        const categoryName = gesture.categoryName;
        const confidence = gesture.score;

        const mappedLetter = mapGestureToLetter(categoryName);
        latestGestureOutput.innerText = `Latest Gesture: ${mappedLetter} (Confidence: ${(confidence * 100).toFixed(2)}%)`;

        if (confidence >= CONFIDENCE_THRESHOLD) {
            if (!confidenceWarning.classList.contains("hidden")) {
                confidenceWarning.classList.add("hidden");
            }

            if (categoryName !== currentGesture) {
                currentGesture = categoryName;

                if (gestureCaptureTimeout) {
                    clearTimeout(gestureCaptureTimeout);
                }

                gestureCaptureTimeout = setTimeout(() => {
                    if (mappedLetter === 'go') {
                        finalizeCurrentWord();  // Finalize current word
                    } else if (mappedLetter === ' ') { // Handle space gesture
                        finalizeCurrentWordWithTTS();
                    } else {
                        currentWord += mappedLetter;  // Add letter to word
                        updateAccumulatedGesturesDisplay();
                        sendGesturesToServer(false);  // Send for ongoing prediction
                    }

                    currentGesture = null;
                    gestureCaptureTimeout = null;
                }, waitTime * 1000);
            }
        } else {
            if (confidenceWarning.classList.contains("hidden")) {
                confidenceWarning.classList.remove("hidden");
            }

            if (gestureCaptureTimeout) {
                clearTimeout(gestureCaptureTimeout);
                gestureCaptureTimeout = null;
            }
            currentGesture = null;
        }
    } else {
        latestGestureOutput.innerText = "No gesture detected";
        if (!confidenceWarning.classList.contains("hidden")) {
            confidenceWarning.classList.add("hidden");
        }

        if (gestureCaptureTimeout) {
            clearTimeout(gestureCaptureTimeout);
            gestureCaptureTimeout = null;
        }
        currentGesture = null;
    }

    window.requestAnimationFrame(predictWebcam);
}

// Map gesture category to letter or action
function mapGestureToLetter(categoryName) {
    return gestureToLetterMap[categoryName] || categoryName;
}

// Update display for accumulated gestures
function updateAccumulatedGesturesDisplay() {
    accumulatedGesturesOutput.innerText = `Accumulated Gestures: ${context} ${currentWord}`.trim();
}

// Send gestures to the server for prediction and word finalization
function sendGesturesToServer(finalize) {
    fetch('/predict', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            context: context,
            currentWord: currentWord,
            finalize: finalize,
            voice: getSelectedVoice() === 'female' ? 'Alice' : 'Brian'
        })
    })
    .then(response => response.json())
    .then(data => {
        const mostLikelyWord = data.prediction.most_likely_word;
        if (predictedWordOutput) {
            predictedWordOutput.innerText = `Predicted Word: ${mostLikelyWord}`;
        }

        if (finalize && data.prediction.most_likely_word && data.audio_id) {
            context += mostLikelyWord + " ";
            currentWord = "";
            updateAccumulatedGesturesDisplay();
            pollForAudio(data.audio_id);  // Start polling for audio
        }
    })
    .catch((error) => {
        console.error('Error:', error);
    });
}

// Finalize current word
function finalizeCurrentWord() {
    if (currentWord.trim() === "") return;
    sendGesturesToServer(true);
}

function finalizeCurrentWordWithTTS() {
    if (currentWord.trim() === "") return;

    const wordToFinalize = currentWord.trim();
    context += wordToFinalize + " ";
    currentWord = "";
    updateAccumulatedGesturesDisplay();
    sendWordForTTS(wordToFinalize);
}

function getSelectedVoice() {
    return document.querySelector('input[name="voiceType"]:checked').value;
}

// Send word to server for TTS
function sendWordForTTS(word) {
    fetch('/tts', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            word: word,
            voice: getSelectedVoice() === 'female' ? 'Alice' : 'Brian'
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.audio_id) {
            pollForAudio(data.audio_id);  // Poll for audio
        }
    })
    .catch((error) => {
        console.error('Error:', error);
    });
}

// Poll for audio and play once ready
function pollForAudio(audio_id) {
    const pollInterval = 1000;  // Poll every second
    const maxAttempts = 30;
    let attempts = 0;

    const intervalId = setInterval(() => {
        fetch(`/get_audio/${audio_id}`)
        .then(response => {
            if (response.status === 202) {
                return null;  // Audio not ready
            } else if (response.status === 200) {
                return response.json();
            }
        })
        .then(data => {
            if (data && data.audio) {
                playAudioFromBase64(data.audio);
                clearInterval(intervalId);  // Stop polling
            }
        })
        .catch(error => {
            console.error('Error fetching audio:', error);
            clearInterval(intervalId);
        });

        attempts += 1;
        if (attempts >= maxAttempts) {
            console.warn('Audio generation timed out.');
            clearInterval(intervalId);
        }
    }, pollInterval);
}

// Play audio from Base64
function playAudioFromBase64(base64Audio) {
    const audio = new Audio(`data:audio/mpeg;base64,${base64Audio}`);
    audio.play().catch(error => {
        console.error("Error playing audio:", error);
    });
}

// Initialize webcam and start detection
if (hasGetUserMedia()) {
    enableWebcamButton.addEventListener("click", enableCam);
    cameraSelect.addEventListener("change", enableCam);
} else {
    console.warn("getUserMedia() is not supported by your browser");
    showErrorOverlay("Your browser does not support webcam access.");
}

// Clear accumulated gestures
if (clearButton) {
    clearButton.addEventListener("click", () => {
        context = "";
        currentWord = "";
        updateAccumulatedGesturesDisplay();
        gestureCount = 0;  // Reset gesture count

        if (gestureCaptureTimeout) {
            clearTimeout(gestureCaptureTimeout);
            gestureCaptureTimeout = null;
        }

        if (predictedWordOutput) {
            predictedWordOutput.innerText = "Predicted word will appear here";
        }
    });
}
