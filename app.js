
// DOM Elements
const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const ctx = overlay.getContext('2d');
const countEl = document.getElementById('count');
const statusEl = document.getElementById('status');
const totalRepsEl = document.getElementById('totalReps');
const durationEl = document.getElementById('duration');
const rpmEl = document.getElementById('rpm');
const bestSessionEl = document.getElementById('bestSession');
const startStopBtn = document.getElementById('startStopBtn');
const resetBtn = document.getElementById('resetBtn');
const messageEl = document.getElementById('message');

// Pose Detection
let detector;
let isRunning = false;
let pushupCount = 0;
let sessionStartTime = null;
let bestSession = parseInt(localStorage.getItem('goldenPushupsBest')) || 0;
let statsInterval = null;

// State tracking
let lastShoulderY = null;
let chestLowered = false;
let repInProgress = false;

// Milestone messages
const milestones = { 10: "🔥 Great start!", 20: "💪 You're unstoppable!", 50: "🏆 Legend mode activated!" };

// Initialize best session
bestSessionEl.textContent = bestSession;

// Setup canvas to match video
function resizeCanvas() {
  const { videoWidth, videoHeight } = video;
  overlay.width = videoWidth;
  overlay.height = videoHeight;
}

// Draw skeleton (upper body only)
function drawPose(pose) {
  ctx.clearRect(0, 0, overlay.width, overlay.height);

  const keypoints = pose.keypoints;

  // Upper body connections: shoulders, arms, neck
  const connections = [
    [5, 6],  // left shoulder to right
    [5, 7],  // left shoulder to left elbow
    [7, 9],  // left elbow to left wrist
    [6, 8],  // right shoulder to right elbow
    [8, 10], // right elbow to right wrist
    [0, 5],  // nose to left shoulder
    [0, 6],  // nose to right shoulder
  ];

  // Draw joints
  keypoints.forEach(kp => {
    if (kp.score > 0.5) {
      ctx.beginPath();
      ctx.arc(kp.x, kp.y, 5, 0, 2 * Math.PI);
      ctx.fillStyle = '#f9d423';
      ctx.fill();
    }
  });

  // Draw connections
  connections.forEach(([i, j]) => {
    const a = keypoints[i];
    const b = keypoints[j];
    if (a.score > 0.5 && b.score > 0.5) {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = '#0f3460';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  });
}

// Analyze posture to detect pushup
function detectPushup(shoulderY, headY) {
  // Use vertical position of shoulder and head
  const avgY = (shoulderY + headY) / 2;

  if (lastShoulderY === null) {
    lastShoulderY = avgY;
    return;
  }

  const diff = avgY - lastShoulderY;
  const threshold = 25; // pixels

  if (diff > threshold) {
    // Going down
    if (!chestLowered) {
      chestLowered = true;
      repInProgress = true;
      statusEl.textContent = "Down";
      statusEl.style.color = "#ff6b6b";
    }
  } else if (diff < -threshold) {
    // Coming up
    if (chestLowered && repInProgress) {
      chestLowered = false;
      pushupCount++;
      countEl.textContent = pushupCount;
      countEl.classList.add('pop');
      setTimeout(() => countEl.classList.remove('pop'), 400);

      // Check milestone
      if (milestones[pushupCount]) {
        messageEl.textContent = milestones[pushupCount];
        messageEl.classList.add('show');
        setTimeout(() => messageEl.classList.remove('show'), 3000);
      }

      statusEl.textContent = "Up";
      statusEl.style.color = "#66ff66";
    }
  }

  lastShoulderY = avgY;
}

// Update stats every second
function updateStats() {
  const elapsedMs = Date.now() - sessionStartTime;
  const seconds = Math.floor(elapsedMs / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  durationEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;

  const rpm = mins > 0 ? (pushupCount / mins) : (pushupCount / (seconds / 60));
  rpmEl.textContent = rpm.toFixed(1);

  totalRepsEl.textContent = pushupCount;
}

// Start pose detection loop
async function startDetection() {
  resizeCanvas();
  statsInterval = setInterval(updateStats, 1000);

  const model = poseDetection.SupportedModels.MediaPipePose;
  detector = await poseDetection.createDetector(model, {
    runtime: 'tfjs',
    modelType: 'lite',
    enableSmoothing: true,
    flipHorizontal: true
  });

  async function loop() {
    if (!isRunning) return;

    let poses = [];
    try {
      poses = await detector.estimatePoses(video);
    } catch (err) {
      console.warn("Pose estimation error:", err);
    }

    if (poses.length > 0) {
      const pose = poses[0];
      drawPose(pose);

      const leftShoulder = pose.keypoints[5];
      const rightShoulder = pose.keypoints[6];
      const nose = pose.keypoints[0];

      // Prefer right shoulder, fallback to left
      const shoulder = rightShoulder.score > 0.5 ? rightShoulder : 
                       leftShoulder.score > 0.5 ? leftShoulder : null;

      if (shoulder && nose && shoulder.score > 0.5 && nose.score > 0.5) {
        detectPushup(shoulder.y, nose.y);
      } else {
        statusEl.textContent = "Align body";
      }
    } else {
      statusEl.textContent = "Detecting...";
    }

    requestAnimationFrame(loop);
  }

  loop();
}

// Start camera stream
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: "user" },
      audio: false
    });
    video.srcObject = stream;
    return new Promise((resolve) => {
      video.onloadedmetadata = () => {
        video.play();
        resizeCanvas();
        resolve();
      };
    });
  } catch (err) {
    alert("Camera access denied: " + err.message);
    console.error(err);
  }
}

// Toggle Start/Stop
startStopBtn.addEventListener('click', async () => {
  if (isRunning) {
    // Stop
    isRunning = false;
    clearInterval(statsInterval);
    startStopBtn.textContent = "Start Session";
    startStopBtn.classList.remove('active');
    statusEl.textContent = "Session Ended";

    // Update best session
    if (pushupCount > bestSession) {
      bestSession = pushupCount;
      bestSessionEl.textContent = bestSession;
      localStorage.setItem('goldenPushupsBest', bestSession);
    }
  } else {
    // Start
    await startCamera();
    isRunning = true;
    sessionStartTime = Date.now();
    pushupCount = 0;
    lastShoulderY = null;
    chestLowered = false;
    repInProgress = false;
    countEl.textContent = '0';
    totalRepsEl.textContent = '0';
    durationEl.textContent = '0:00';
    rpmEl.textContent = '0';
    statusEl.textContent = "In Progress...";
    statusEl.style.color = "#66ff66";
    startStopBtn.textContent = "Stop Session";
    startStopBtn.classList.add('active');
    startDetection();
  }
});

// Reset counter
resetBtn.addEventListener('click', () => {
  pushupCount = 0;
  countEl.textContent = '0';
  totalRepsEl.textContent = '0';
  durationEl.textContent = '0:00';
  rpmEl.textContent = '0';
  statusEl.textContent = "Reset";
  messageEl.classList.remove('show');
});

// Initial setup
bestSessionEl.textContent = bestSession;