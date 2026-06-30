import {
    FaceDetector,
    FilesetResolver
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/vision_bundle.mjs";

const video = document.getElementById("webcam");
const overlay = document.getElementById("overlay");
const overlayCtx = overlay.getContext("2d");

const statusEl = document.getElementById("status");

const btnStart = document.getElementById("btn-start");
const btnRestart = document.getElementById("btn-restart");
const btnDownload = document.getElementById("btn-download");

const progressFill = document.getElementById("progressFill");
const progressPercent = document.getElementById("progressPercent");

const toast = document.getElementById("toast");

let faceDetector;
let lastVideoTime = -1;

let isWaiting = false;

let confettiAnimationRunning = false;

let captures = {
    front: false,
    left: false,
    right: false
};

const captureOrder = [
    "front",
    "left",
    "right"
];

async function initializeDetector() {
    try {
        updateStatus("Downloading AI Model...");

        const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm"
        );

        faceDetector = await FaceDetector.createFromOptions(
            vision,
            {
                baseOptions: {
                    modelAssetPath:
                        "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
                    delegate: "GPU"
                },
                runningMode: "VIDEO",
                minDetectionConfidence: 0.8
            }
        );

        updateStatus("AI Ready • Click Start");

        btnStart.disabled = false;
        btnStart.innerText = "Start Camera";
    }
    catch (error) {
        console.error(error);

        updateStatus("Failed to load AI Model");
    }
}

function updateStatus(message) {
    statusEl.animate(
        [
            {
                opacity: 0,
                transform: "translateY(-10px)"
            },
            {
                opacity: 1,
                transform: "translateY(0)"
            }
        ],
        {
            duration: 350
        }
    );

    statusEl.innerText = message;
}

function showToast(message) {
    toast.innerText = message;

    toast.classList.add("show");

    setTimeout(() => {
        toast.classList.remove("show");
    }, 2500);
}

function updateProgress() {
    let completed = 0;

    if (captures.front) completed++;
    if (captures.left) completed++;
    if (captures.right) completed++;

    const percentage = completed * 100 / 3;

    progressFill.style.width = percentage + "%";

    progressPercent.innerText =
        Math.round(percentage) + "%";
}

function getNextPose() {
    for (const pose of captureOrder) {
        if (!captures[pose]) {
            return pose;
        }
    }

    return null;
}

function markCaptured(position) {
    captures[position] = true;

    const slotEl = document.getElementById(`slot-${position}`);

    slotEl.classList.add("captured");

    const label = slotEl.querySelector(".status-label");
    if (label) label.innerText = "Captured";

    updateProgress();

    showToast(
        position.charAt(0).toUpperCase() +
        position.slice(1) +
        " Captured"
    );
}

btnStart.addEventListener("click", () => {

    btnStart.style.display = "none";

    updateStatus("Requesting Camera Permission...");

    startCamera();

});

btnRestart.addEventListener("click", restartCapture);

btnDownload.addEventListener("click", downloadProfiles);

async function startCamera() {

    try {

        const stream =
            await navigator.mediaDevices.getUserMedia({

                video: {
                    width: 640,
                    height: 480
                }

            });

        video.srcObject = stream;

        video.style.display = "block";

        video.addEventListener(
            "loadeddata",
            onCameraReady,
            {
                once: true
            }
        );

    }

    catch (error) {

        console.error(error);

        updateStatus("Camera Permission Denied");

    }

}

function onCameraReady() {

    overlay.width = video.videoWidth;

    overlay.height = video.videoHeight;

    updateStatus("Look Straight at Camera");

    predictLoop();

}

function predictLoop() {
    if (video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;

        const detections = faceDetector.detectForVideo(
            video,
            performance.now()
        ).detections;

        overlayCtx.clearRect(
            0,
            0,
            overlay.width,
            overlay.height
        );

        if (detections.length > 0) {
            drawDetection(detections[0]);
            processDetection(detections[0]);
        }
    }

    requestAnimationFrame(predictLoop);
}

function drawDetection(face) {
    const box = face.boundingBox;

    overlayCtx.strokeStyle = "#00e5ff";
    overlayCtx.lineWidth = 3;

    overlayCtx.shadowColor = "#00e5ff";
    overlayCtx.shadowBlur = 20;

    overlayCtx.strokeRect(
        box.originX,
        box.originY,
        box.width,
        box.height
    );

    const corner = 25;

    overlayCtx.beginPath();

    overlayCtx.moveTo(box.originX, box.originY + corner);
    overlayCtx.lineTo(box.originX, box.originY);
    overlayCtx.lineTo(box.originX + corner, box.originY);

    overlayCtx.moveTo(
        box.originX + box.width - corner,
        box.originY
    );
    overlayCtx.lineTo(
        box.originX + box.width,
        box.originY
    );
    overlayCtx.lineTo(
        box.originX + box.width,
        box.originY + corner
    );

    overlayCtx.moveTo(
        box.originX,
        box.originY + box.height - corner
    );
    overlayCtx.lineTo(
        box.originX,
        box.originY + box.height
    );
    overlayCtx.lineTo(
        box.originX + corner,
        box.originY + box.height
    );

    overlayCtx.moveTo(
        box.originX + box.width - corner,
        box.originY + box.height
    );
    overlayCtx.lineTo(
        box.originX + box.width,
        box.originY + box.height
    );
    overlayCtx.lineTo(
        box.originX + box.width,
        box.originY + box.height - corner
    );

    overlayCtx.stroke();

    overlayCtx.shadowBlur = 0;
}

function processDetection() {
    if (isWaiting) {
        return;
    }

    const nextPose = getNextPose();
    const cameraWrapper = document.querySelector(".camera-wrapper");

    if (!nextPose) {
        return;
    }

    isWaiting = true;
    cameraWrapper.classList.add("capturing");

    switch (nextPose) {
        case "front":
            updateStatus("Capturing Front View...");
            break;

        case "left":
            updateStatus("Capturing Left Profile...");
            break;

        case "right":
            updateStatus("Capturing Right Profile...");
            break;
    }

    setTimeout(() => {
        captureImage(nextPose);

        if (nextPose !== "right") {
            updateStatus("Move to Next Position");
        }

        setTimeout(() => {
            isWaiting = false;
            cameraWrapper.classList.remove("capturing");

            const remaining = getNextPose();

            if (remaining) {
                switch (remaining) {
                    case "front":
                        updateStatus("Look Straight at Camera");
                        break;

                    case "left":
                        updateStatus("Turn Left");
                        break;

                    case "right":
                        updateStatus("Turn Right");
                        break;
                }
            }
        }, 1800);

    }, 1200);
}

function fadeOutConfetti() {

    confettiAnimationRunning = false;

    const canvas = document.getElementById("confettiCanvas");

    canvas.classList.add("fade-out");

    setTimeout(() => {
        const ctx = canvas.getContext("2d");
        ctx.clearRect(
            0,
            0,
            canvas.width,
            canvas.height
        );

        canvas.classList.remove("fade-out");
    }, 1500);
}

function captureImage(position) {
    const canvas = document.getElementById(
        `canvas-${position}`
    );

    const ctx = canvas.getContext("2d");

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    ctx.drawImage(
        video,
        0,
        0,
        canvas.width,
        canvas.height
    );

    markCaptured(position);

    const slot = document.getElementById(
        `slot-${position}`
    );

    slot.animate(
        [
            {
                transform: "scale(.85)",
                opacity: .6
            },
            {
                transform: "scale(1.05)",
                opacity: 1
            },
            {
                transform: "scale(1)"
            }
        ],
        {
            duration: 500,
            easing: "ease-out"
        }
    );

    checkCompletion();
}

function checkCompletion() {
    if (
        captures.front &&
        captures.left &&
        captures.right
    ) {
        updateStatus("All Profiles Captured Successfully");

        btnDownload.classList.add("active");

        showToast("Capture Complete");

        launchConfetti();
    }
}

function restartCapture() {

    fadeOutConfetti();

    captures = {
        front: false,
        left: false,
        right: false
    };

    isWaiting = false;

    updateProgress();

    btnDownload.classList.remove("active");

    const positions = [
        "front",
        "left",
        "right"
    ];

    positions.forEach((position) => {
        const canvas = document.getElementById(`canvas-${position}`);
        const ctx = canvas.getContext("2d");

        ctx.clearRect(
            0,
            0,
            canvas.width,
            canvas.height
        );

        const slotEl = document.getElementById(`slot-${position}`);

        slotEl.classList.remove("captured");

        const label = slotEl.querySelector(".status-label");
        if (label) label.innerText = "Not Captured";
    });

    updateStatus("Look Straight at Camera");

    showToast("Ready For New Capture");
}

function downloadProfiles() {
    if (
        !captures.front ||
        !captures.left ||
        !captures.right
    ) {
        showToast("Capture All Profiles First");
        return;
    }

    downloadCanvas(
        "canvas-front",
        "front_profile.png"
    );

    setTimeout(() => {
        downloadCanvas(
            "canvas-left",
            "left_profile.png"
        );
    }, 300);

    setTimeout(() => {
        downloadCanvas(
            "canvas-right",
            "right_profile.png"
        );
    }, 600);

    showToast("Downloading Images");
}

function downloadCanvas(id, fileName) {
    const canvas = document.getElementById(id);

    const link = document.createElement("a");

    link.download = fileName;

    link.href = canvas.toDataURL("image/png");

    link.click();
}

function launchConfetti() {

    confettiAnimationRunning = true;

    const canvas = document.getElementById("confettiCanvas");

    const ctx = canvas.getContext("2d");

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles = [];

    for (let i = 0; i < 250; i++) {
        particles.push({
            x: Math.random() * canvas.width,
            y: -Math.random() * canvas.height,
            r: 4 + Math.random() * 6,
            dx: (Math.random() - 0.5) * 6,
            dy: 3 + Math.random() * 5,
            rotation: Math.random() * 360,
            speed: Math.random() * 8,
            color: [
                "#4F46E5",
                "#22C55E",
                "#06B6D4",
                "#FACC15",
                "#EC4899",
                "#F97316"
            ][Math.floor(Math.random() * 6)]
        });
    }

    let frame = 0;

    function animate() {
        ctx.clearRect(
            0,
            0,
            canvas.width,
            canvas.height
        );

        particles.forEach((particle) => {
            ctx.save();

            ctx.translate(
                particle.x,
                particle.y
            );

            ctx.rotate(
                particle.rotation *
                Math.PI /
                180
            );

            ctx.fillStyle = particle.color;

            ctx.fillRect(
                -particle.r / 2,
                -particle.r / 2,
                particle.r,
                particle.r
            );

            ctx.restore();

            particle.x += particle.dx;

            particle.y += particle.dy;

            particle.rotation += particle.speed;
        });

        frame++;

        if (frame < 220 && confettiAnimationRunning) {
            requestAnimationFrame(animate);
        } else {
            ctx.clearRect(
                0,
                0,
                canvas.width,
                canvas.height
            );
        }
    }

    animate();
}

window.addEventListener("resize", () => {
    const canvas = document.getElementById("confettiCanvas");

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

document.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", function () {
        this.animate(
            [
                {
                    transform: "scale(1)"
                },
                {
                    transform: "scale(0.94)"
                },
                {
                    transform: "scale(1)"
                }
            ],
            {
                duration: 220,
                easing: "ease-out"
            }
        );
    });
});

initializeDetector();