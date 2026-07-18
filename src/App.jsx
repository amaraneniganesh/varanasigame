import React, { useEffect, useRef } from 'react';
import './App.css';

// ---------- SPRITES asset configuration ----------
const SPRITES = {
  playerSteady: "assets/steady.png",
  playerRun: ["assets/run1.png", "assets/run2.png"],
  playerJump: "assets/jump.png",
  playerDuck: "assets/duck.png",
  obstacles: ["assets/obstacle1.png", "assets/obstacle2.png"],
  background: "assets/background2.png",
  ground: "assets/ground.png"
};

// ---------- Fixed ratios / frame counts (never change) ----------
const JUMP_DRAW_SCALE = 1.05;
const OBSTACLE_ASPECT = 346 / 327;
const JUMP_DURATION = 52;
const RECOVER_DURATION = 20;
const STATIC_BG_SRC_H = 492;
const GROUND_SRC_H = 100;

const SPRITE_FALLBACK_BOUNDS = {
  playerSteady: { left: 0.15, right: 0.84, top: 0.03, bottom: 0.87 },
  playerRun1: { left: 0.0, right: 1.0, top: 0.0, bottom: 1.0 },
  playerRun2: { left: 0.0, right: 1.0, top: 0.0, bottom: 1.0 },
  playerJump: { left: 0.03, right: 0.94, top: 0.09, bottom: 0.92 },
  obstacle1: { left: 0.01, right: 0.99, top: 0.02, bottom: 1.0 }
};

// ---------- Responsive dimension calculator ----------
function getDimensions() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const isPortrait = vh > vw && vw < 800;

  let W, H;
  if (isPortrait) {
    W = vw;
    H = Math.min(Math.max(Math.round(vh * 0.55), 320), 550);
  } else {
    W = Math.min(vw - 20, 1000);
    H = Math.round(W * 0.38);
  }

  return { W, H, isPortrait };
}

// ---------- Static Helper Functions ----------
function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) { resolve(null); return; }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function getFallbackBoundsForSrc(src) {
  if (!src) return { left: 0, right: 1, top: 0, bottom: 1 };
  if (src.includes("steady.png")) return SPRITE_FALLBACK_BOUNDS.playerSteady;
  if (src.includes("run1.png")) return SPRITE_FALLBACK_BOUNDS.playerRun1;
  if (src.includes("run2.png")) return SPRITE_FALLBACK_BOUNDS.playerRun2;
  if (src.includes("jump.png")) return SPRITE_FALLBACK_BOUNDS.playerJump;
  if (src.includes("obstacle1.png")) return SPRITE_FALLBACK_BOUNDS.obstacle1;
  return { left: 0, right: 1, top: 0, bottom: 1 };
}

function computeAlphaMask(img) {
  if (!img) return null;
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) return null;

  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const octx = off.getContext("2d");
  octx.drawImage(img, 0, 0, w, h);

  let data;
  try {
    data = octx.getImageData(0, 0, w, h).data;
  } catch (e) {
    return null;
  }

  const ALPHA_THRESHOLD = 20;
  const mask = [];
  let minX = w, maxX = 0, minY = h, maxY = 0, found = false;

  for (let y = 0; y < h; y++) {
    const row = new Uint8Array(w);
    for (let x = 0; x < w; x++) {
      const alpha = data[(y * w + x) * 4 + 3];
      if (alpha > ALPHA_THRESHOLD) {
        row[x] = 1;
        found = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      } else {
        row[x] = 0;
      }
    }
    mask.push(row);
  }

  if (!found) return null;

  const bounds = {
    left: minX / w,
    right: (maxX + 1) / w,
    top: minY / h,
    bottom: (maxY + 1) / h
  };

  return { width: w, height: h, mask, bounds };
}

function attachBoundsAndMask(img, src) {
  if (!img) return img;
  const maskData = computeAlphaMask(img);
  if (maskData) {
    img.pixelMask = maskData.mask;
    img.pixelWidth = maskData.width;
    img.pixelHeight = maskData.height;
    img.hitboxBounds = maskData.bounds;
  } else {
    img.pixelMask = null;
    img.hitboxBounds = getFallbackBoundsForSrc(src);
  }
  return img;
}

async function loadAll() {
  const [steady, run1, run2, jump, duck, ground] = await Promise.all([
    loadImage(SPRITES.playerSteady),
    loadImage(SPRITES.playerRun[0]),
    loadImage(SPRITES.playerRun[1]),
    loadImage(SPRITES.playerJump),
    loadImage(SPRITES.playerDuck),
    loadImage(SPRITES.ground)
  ]);
  const background = await loadImage(SPRITES.background);
  const obstacleImgs = await Promise.all(SPRITES.obstacles.map(loadImage));

  attachBoundsAndMask(steady, SPRITES.playerSteady);
  attachBoundsAndMask(run1, SPRITES.playerRun[0]);
  attachBoundsAndMask(run2, SPRITES.playerRun[1]);
  attachBoundsAndMask(jump, SPRITES.playerJump);
  attachBoundsAndMask(duck, SPRITES.playerDuck);
  obstacleImgs.forEach((img, idx) => attachBoundsAndMask(img, SPRITES.obstacles[idx]));

  return {
    steady,
    run: [run1, run2].filter(Boolean),
    jump,
    duck,
    ground,
    background,
    obstacles: obstacleImgs.filter(Boolean)
  };
}

function tightBox(entity, img) {
  const bounds = img && img.hitboxBounds;
  if (!bounds) return entity;
  return {
    x: entity.x + bounds.left * entity.w,
    y: entity.y + bounds.top * entity.h,
    w: (bounds.right - bounds.left) * entity.w,
    h: (bounds.bottom - bounds.top) * entity.h
  };
}

function hexagonVertices(b) {
  const inset = b.w * 0.22;
  return [
    { x: b.x + inset, y: b.y },
    { x: b.x + b.w - inset, y: b.y },
    { x: b.x + b.w, y: b.y + b.h / 2 },
    { x: b.x + b.w - inset, y: b.y + b.h },
    { x: b.x + inset, y: b.y + b.h },
    { x: b.x, y: b.y + b.h / 2 }
  ];
}

function polygonAxes(poly) {
  const axes = [];
  for (let i = 0; i < poly.length; i++) {
    const p1 = poly[i], p2 = poly[(i + 1) % poly.length];
    axes.push({ x: -(p2.y - p1.y), y: (p2.x - p1.x) });
  }
  return axes;
}

function projectPolygon(poly, axis) {
  let min = Infinity, max = -Infinity;
  for (const p of poly) {
    const dot = p.x * axis.x + p.y * axis.y;
    if (dot < min) min = dot;
    if (dot > max) max = dot;
  }
  return { min, max };
}

function polygonsIntersect(polyA, polyB) {
  const axes = [...polygonAxes(polyA), ...polygonAxes(polyB)];
  for (const axis of axes) {
    const a = projectPolygon(polyA, axis);
    const b = projectPolygon(polyB, axis);
    if (a.max < b.min || b.max < a.min) return false;
  }
  return true;
}

function collides(entityA, imgA, entityB, imgB) {
  const boxA = tightBox(entityA, imgA);
  const boxB = tightBox(entityB, imgB);

  const xStart = Math.max(boxA.x, boxB.x);
  const yStart = Math.max(boxA.y, boxB.y);
  const xEnd = Math.min(boxA.x + boxA.w, boxB.x + boxB.w);
  const yEnd = Math.min(boxA.y + boxA.h, boxB.y + boxB.h);

  if (xStart >= xEnd || yStart >= yEnd) {
    return false;
  }

  if (!imgA || !imgA.pixelMask || !imgB || !imgB.pixelMask) {
    return polygonsIntersect(hexagonVertices(boxA), hexagonVertices(boxB));
  }

  for (let y = yStart; y < yEnd; y++) {
    const yA = Math.floor(((y - entityA.y) / entityA.h) * imgA.pixelHeight);
    if (yA < 0 || yA >= imgA.pixelHeight) continue;
    const rowA = imgA.pixelMask[yA];

    const yB = Math.floor(((y - entityB.y) / entityB.h) * imgB.pixelHeight);
    if (yB < 0 || yB >= imgB.pixelHeight) continue;
    const rowB = imgB.pixelMask[yB];

    for (let x = xStart; x < xEnd; x++) {
      const xA = Math.floor(((x - entityA.x) / entityA.w) * imgA.pixelWidth);
      if (xA < 0 || xA >= imgA.pixelWidth) continue;

      const xB = Math.floor(((x - entityB.x) / entityB.w) * imgB.pixelWidth);
      if (xB < 0 || xB >= imgB.pixelWidth) continue;

      if (rowA[xA] && rowB[xB]) {
        return true;
      }
    }
  }

  return false;
}

function easeInOutQuad(p) {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

// ---------- React App Component ----------
function App() {
  const canvasRef = useRef(null);
  const scoreValRef = useRef(null);
  const hiscoreValRef = useRef(null);
  const msgRef = useRef(null);
  const gameOverOverlayRef = useRef(null);
  const finalScoreValRef = useRef(null);
  const retryBtnRef = useRef(null);
  const bestScoreMsgRef = useRef(null);
  const settingsBtnRef = useRef(null);
  const settingsOverlayRef = useRef(null);
  const closeSettingsBtnRef = useRef(null);
  const volumeSliderRef = useRef(null);
  const muteCheckboxRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");

    // ---- Dynamic game dimensions ----
    let W, H, GROUND_Y, PLAYER_W, PLAYER_H;
    let JUMP_HEIGHT, JUMP_FORWARD_BASE, JUMP_FORWARD_SPEED_FACTOR, BASE_X, START_SPEED;

    let isPortrait = false;

    function applyConstants() {
      const d = getDimensions();
      W = d.W;
      H = d.H;
      isPortrait = d.isPortrait;
      GROUND_Y = H - Math.max(Math.round(H * 0.053), 15);

      if (isPortrait) {
        PLAYER_W = Math.max(68, Math.round(W * 0.1));
        JUMP_FORWARD_BASE = Math.round(W * 0.18);
        JUMP_FORWARD_SPEED_FACTOR = Math.round(W * 0.08);
        START_SPEED = Math.max(W * 0.009, 3.5);
        JUMP_HEIGHT = Math.max(90, Math.round(H * 0.32));
      } else {
        PLAYER_W = Math.max(60, Math.round(W * 0.08));
        JUMP_FORWARD_BASE = Math.max(35, Math.round(W * 0.045));
        JUMP_FORWARD_SPEED_FACTOR = Math.max(W * 0.009, 4);
        START_SPEED = Math.max(W * 0.006, 2.5);
        JUMP_HEIGHT = Math.max(80, Math.round(H * 0.25));
      }
      PLAYER_H = PLAYER_W;
      BASE_X = Math.max(35, Math.round(W * 0.06));
    }

    applyConstants();
    canvas.width = W;
    canvas.height = H;
    ctx.imageSmoothingEnabled = true;

    // Audio setup
    const runnerAudio = new Audio("assets/varanasirunning.mp3");
    runnerAudio.loop = true;
    const winnerAudio = new Audio("assets/Varanasiwinner.mp3");

    let savedVolume = parseFloat(localStorage.getItem("pixelRunnerVolume") || "1");
    let savedMuted = localStorage.getItem("pixelRunnerMuted") === "true";
    runnerAudio.volume = savedVolume;
    winnerAudio.volume = savedVolume;
    runnerAudio.muted = savedMuted;
    winnerAudio.muted = savedMuted;

    // Game state references
    let assets = null;
    let running = false;
    let gameOver = false;
    let score = 0;
    let hiscore = Number(localStorage.getItem("pixelRunnerHi") || 0);
    let speed = START_SPEED;
    let frameCount = 0;
    let bgX = 0;
    let groundX = 0;
    let obstacles = [];
    let nextObstacleIn = 60;

    const player = {
      x: BASE_X,
      y: GROUND_Y - PLAYER_H,
      w: PLAYER_W,
      h: PLAYER_H,
      jumping: false,
      jumpTimer: 0,
      xOffset: 0,
      jumpForwardDist: 0,
      recovering: false,
      recoverTimer: 0,
      recoverDuration: 20,
      runFrame: 0
    };

    function syncPlayerToDimensions() {
      PLAYER_W = isPortrait ? Math.max(68, Math.round(W * 0.1)) : Math.max(60, Math.round(W * 0.08));
      PLAYER_H = PLAYER_W;
      player.w = PLAYER_W;
      player.h = PLAYER_H;
      player.y = GROUND_Y - PLAYER_H;
      if (!player.jumping && !player.recovering) {
        player.x = BASE_X;
        player.xOffset = 0;
      }
    }

    function startGame() {
      running = true;
      gameOver = false;
      if (msgRef.current) msgRef.current.textContent = "";

      runnerAudio.currentTime = 0;
      runnerAudio.play().catch(e => console.warn(e));
      winnerAudio.pause();
      winnerAudio.currentTime = 0;
    }

    function resetGame() {
      score = 0;
      speed = START_SPEED;
      bgX = 0;
      groundX = 0;
      obstacles = [];
      nextObstacleIn = 60;
      player.x = BASE_X;
      player.y = GROUND_Y - PLAYER_H;
      player.jumping = false;
      player.jumpTimer = 0;
      player.xOffset = 0;
      player.recovering = false;
      player.recoverTimer = 0;
      gameOver = false;
      running = false;

      runnerAudio.pause();
      winnerAudio.pause();
      if (gameOverOverlayRef.current) gameOverOverlayRef.current.style.display = "none";
      if (msgRef.current) {
        msgRef.current.textContent = "Press SPACE or tap the game to jump. Press SPACE to start.";
      }
    }

    function endGame() {
      running = false;
      gameOver = true;

      runnerAudio.pause();

      const currentScore = Math.floor(score);
      let beatBest = false;

      if (currentScore > hiscore || hiscore === 0) {
        hiscore = currentScore;
        beatBest = true;
        localStorage.setItem("pixelRunnerHi", hiscore);
      }

      if (hiscoreValRef.current) hiscoreValRef.current.textContent = "BEST: " + hiscore;
      if (finalScoreValRef.current) finalScoreValRef.current.textContent = "SCORE: " + currentScore;

      if (bestScoreMsgRef.current) {
        bestScoreMsgRef.current.style.display = beatBest ? "block" : "none";
      }

      if (beatBest && currentScore > 0) {
        winnerAudio.currentTime = 0;
        winnerAudio.play().catch(e => console.warn(e));
      }

      if (gameOverOverlayRef.current) gameOverOverlayRef.current.style.display = "block";
      if (msgRef.current) msgRef.current.textContent = "";
    }

    function jump() {
      if (!running && !gameOver) { startGame(); return; }
      if (gameOver) { resetGame(); return; }
      if (!player.jumping) {
        player.jumping = true;
        player.jumpTimer = 0;
        player.jumpForwardDist = JUMP_FORWARD_BASE + speed * JUMP_FORWARD_SPEED_FACTOR;
        player.recoverDuration = Math.max(25, Math.round(player.jumpForwardDist / speed * 1.3));
      }
    }

    function makeObstacle(xPos) {
      const minH = isPortrait ? 18 : 26;
      const maxH = isPortrait ? 38 : 50;
      const h = minH + Math.random() * (maxH - minH);
      const w = h * OBSTACLE_ASPECT;
      const img = assets.obstacles.length
        ? assets.obstacles[Math.floor(Math.random() * assets.obstacles.length)]
        : null;
      return { x: xPos, y: GROUND_Y - h, w, h, img };
    }

    function spawnObstacle() {
      const first = makeObstacle(W + 20);
      obstacles.push(first);
      if (Math.random() < 0.15) {
        const gap = isPortrait
          ? Math.max(30, Math.round(W * 0.06)) + Math.random() * Math.max(15, Math.round(W * 0.03))
          : Math.max(20, Math.round(W * 0.02)) + Math.random() * Math.max(10, Math.round(W * 0.01));
        obstacles.push(makeObstacle(first.x + first.w + gap));
      }
    }

    function getPlayerRenderState() {
      if (player.jumping && assets.jump) {
        const w = player.w * JUMP_DRAW_SCALE;
        const h = player.h * JUMP_DRAW_SCALE;
        return {
          img: assets.jump,
          x: player.x + player.w / 2 - w / 2,
          y: player.y + player.h - h,
          w,
          h
        };
      }
      if (!running && assets.steady) {
        return { img: assets.steady, x: player.x, y: player.y, w: player.w, h: player.h };
      }
      if (assets.run.length) {
        const f = Math.floor(frameCount / 8) % assets.run.length;
        return { img: assets.run[f], x: player.x, y: player.y, w: player.w, h: player.h };
      }
      return { img: null, x: player.x, y: player.y, w: player.w, h: player.h };
    }

    function drawPlaceholderPlayer(x, y, w, h, jumping) {
      ctx.fillStyle = "#3a9679";
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "#1c4d3c";
      ctx.fillRect(x + w - 16, y + 12, 10, 10);
      if (!jumping) {
        const legOffset = Math.floor(frameCount / 6) % 2 === 0 ? 0 : 6;
        ctx.fillStyle = "#1c4d3c";
        ctx.fillRect(x + 4, y + h - 8, 8, 8 - legOffset * 0.4);
        ctx.fillRect(x + w - 12, y + h - 8, 8, 8 + legOffset * 0.4);
      }
    }

    function drawPlaceholderObstacle(o) {
      ctx.fillStyle = "#d64545";
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.fillStyle = "#241c15";
      ctx.fillRect(o.x + 4, o.y + 4, o.w - 8, 4);
    }

    function update() {
      frameCount++;

      if (running) {
        groundX -= speed;
      }

      ctx.clearRect(0, 0, W, H);

      if (assets && assets.background) {
        const bgImg = assets.background;

        const bgSrcH = STATIC_BG_SRC_H;
        const bgDestH = GROUND_Y;
        ctx.drawImage(bgImg, 0, 0, bgImg.width, bgSrcH, 0, 0, W, bgDestH);

        const groundSrcY = bgImg.height - GROUND_SRC_H;
        const grSrcH = GROUND_SRC_H;
        const grDestH = H - GROUND_Y;
        const groundWidth = grDestH * (bgImg.width / grSrcH);
        const wrappedGrX = groundX % groundWidth;

        for (let x = wrappedGrX; x < W; x += groundWidth) {
          ctx.drawImage(bgImg, 0, groundSrcY, bgImg.width, grSrcH, x, GROUND_Y, groundWidth, grDestH);
        }
      } else {
        ctx.fillStyle = "#f7f4ec";
        ctx.fillRect(0, 0, W, H);

        ctx.strokeStyle = "#241c15";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, GROUND_Y);
        ctx.lineTo(W, GROUND_Y);
        ctx.stroke();
      }

      if (running) {
        if (player.jumping) {
          player.jumpTimer++;
          const p = Math.min(player.jumpTimer / JUMP_DURATION, 1);
          const eased = easeInOutQuad(p);
          const heightArc = Math.sin(eased * Math.PI);
          player.y = (GROUND_Y - PLAYER_H) - heightArc * JUMP_HEIGHT;
          player.xOffset = eased * player.jumpForwardDist;
          if (p >= 1) {
            player.jumping = false;
            player.jumpTimer = 0;
            player.y = GROUND_Y - PLAYER_H;
            player.recovering = true;
            player.recoverTimer = 0;
          }
        } else if (player.recovering) {
          player.recoverTimer++;
          const rp = Math.min(player.recoverTimer / player.recoverDuration, 1);
          player.xOffset = player.jumpForwardDist * (1 - easeInOutQuad(rp));
          if (rp >= 1) {
            player.recovering = false;
            player.xOffset = 0;
          }
        }
        player.x = BASE_X + player.xOffset;

        nextObstacleIn--;
        if (nextObstacleIn <= 0) {
          spawnObstacle();
          const minGap = JUMP_DURATION + player.recoverDuration + 15;
          const baseGap = Math.max(minGap, Math.round(W * 0.18));
          nextObstacleIn = baseGap + Math.round(Math.random() * Math.max(25, Math.round(W * 0.06)));
        }
        obstacles.forEach(o => o.x -= speed);
        obstacles = obstacles.filter(o => o.x + o.w > 0);

        const playerState = getPlayerRenderState();
        for (const o of obstacles) {
          if (collides(playerState, playerState.img, o, o.img)) {
            endGame();
            break;
          }
        }

        score += speed * 0.05;
        speed += 0.0008;

        if (scoreValRef.current) scoreValRef.current.textContent = "SCORE: " + Math.floor(score);
        if (hiscoreValRef.current) hiscoreValRef.current.textContent = "BEST: " + hiscore;
      }

      const drawState = getPlayerRenderState();
      if (drawState.img) {
        ctx.drawImage(drawState.img, drawState.x, drawState.y, drawState.w, drawState.h);
      } else {
        drawPlaceholderPlayer(player.x, player.y, player.w, player.h, player.jumping);
      }

      obstacles.forEach(o => {
        if (o.img) {
          ctx.drawImage(o.img, o.x, o.y, o.w, o.h);
        } else {
          drawPlaceholderObstacle(o);
        }
      });

      animationFrameId = requestAnimationFrame(update);
    }

    // ---- Resize handler ----
    let resizeTimer = null;
    function handleResize() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        applyConstants();
        canvas.width = W;
        canvas.height = H;
        ctx.imageSmoothingEnabled = true;
        syncPlayerToDimensions();
      }, 150);
    }

    // Input bindings
    const handleKeyDown = (e) => {
      if (e.code === "Space") {
        e.preventDefault();
        jump();
      }
    };
    const handleMouseDown = (e) => {
      if (e.target.closest('button')) return;
      jump();
    };
    const handleTouchStart = (e) => {
      if (e.target.closest('button')) return;
      e.preventDefault();
      jump();
    };

    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("touchstart", handleTouchStart, { passive: false });
    window.addEventListener("resize", handleResize);

    const retryBtn = retryBtnRef.current;
    const handleRetryClick = (e) => {
      e.stopPropagation();
      resetGame();
    };
    if (retryBtn) {
      retryBtn.addEventListener("click", handleRetryClick);
    }

    // Settings UI Bindings
    const settingsBtn = settingsBtnRef.current;
    const settingsOverlay = settingsOverlayRef.current;
    const closeSettingsBtn = closeSettingsBtnRef.current;
    const volumeSlider = volumeSliderRef.current;
    const muteCheckbox = muteCheckboxRef.current;
    let wasRunningBeforeSettings = false;

    const updateVolume = (e) => {
      const v = parseFloat(e.target.value);
      runnerAudio.volume = v;
      winnerAudio.volume = v;
      localStorage.setItem("pixelRunnerVolume", v);
    };

    const updateMute = (e) => {
      const m = e.target.checked;
      runnerAudio.muted = m;
      winnerAudio.muted = m;
      localStorage.setItem("pixelRunnerMuted", m);
    };

    const handleSettingsClick = (e) => {
      e.stopPropagation();
      wasRunningBeforeSettings = running;
      if (running) {
        running = false;
        runnerAudio.pause();
      }
      if (settingsOverlay) settingsOverlay.style.display = "block";
      if (volumeSlider) volumeSlider.value = runnerAudio.volume;
      if (muteCheckbox) muteCheckbox.checked = runnerAudio.muted;
    };

    const handleCloseSettingsClick = (e) => {
      e.stopPropagation();
      if (settingsOverlay) settingsOverlay.style.display = "none";
      if (wasRunningBeforeSettings && !gameOver) {
        running = true;
        runnerAudio.play().catch(err => console.warn(err));
      }
    };

    if (volumeSlider) volumeSlider.addEventListener("input", updateVolume);
    if (muteCheckbox) muteCheckbox.addEventListener("change", updateMute);
    if (settingsBtn) settingsBtn.addEventListener("click", handleSettingsClick);
    if (closeSettingsBtn) closeSettingsBtn.addEventListener("click", handleCloseSettingsClick);

    // Boot assets loader
    let animationFrameId;
    loadAll().then(loaded => {
      assets = loaded;
      if (hiscoreValRef.current) hiscoreValRef.current.textContent = "BEST: " + hiscore;
      animationFrameId = requestAnimationFrame(update);
    });

    // Cleanup listeners and animation frame on unmount
    return () => {
      clearTimeout(resizeTimer);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("resize", handleResize);
      if (retryBtn) {
        retryBtn.removeEventListener("click", handleRetryClick);
      }
      if (volumeSlider) volumeSlider.removeEventListener("input", updateVolume);
      if (muteCheckbox) muteCheckbox.removeEventListener("change", updateMute);
      if (settingsBtn) settingsBtn.removeEventListener("click", handleSettingsClick);
      if (closeSettingsBtn) closeSettingsBtn.removeEventListener("click", handleCloseSettingsClick);
      runnerAudio.pause();
      winnerAudio.pause();
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div id="wrap">

      {/* Top HUD: Score centred, Settings pinned right */}
      <div id="hudTop">
        <span id="score" ref={scoreValRef}>SCORE: 0</span>
        <button id="settingsBtn" ref={settingsBtnRef}>⚙️</button>
      </div>

      {/* Game Canvas */}
      <div id="gameContainer">
        <canvas id="game" ref={canvasRef}></canvas>

        {/* Settings Popup */}
        <div id="settingsOverlay" ref={settingsOverlayRef} className="popup-overlay">
          <h2 style={{ color: 'var(--ink)' }}>SETTINGS</h2>
          <div className="settings-row">
            <span>Volume</span>
            <input type="range" ref={volumeSliderRef} min="0" max="1" step="0.05" />
          </div>
          <div className="settings-row">
            <span>Mute</span>
            <input type="checkbox" ref={muteCheckboxRef} />
          </div>
          <button ref={closeSettingsBtnRef} className="popup-btn"
            style={{ background: 'var(--ink)', color: '#fff' }}>
            CLOSE
          </button>
        </div>

        {/* Game Over Popup */}
        <div id="gameOverOverlay" ref={gameOverOverlayRef} className="popup-overlay">
          <h2 style={{ color: 'var(--accent)' }}>GAME OVER</h2>
          <p id="bestScoreMsg" ref={bestScoreMsgRef}
            style={{ color: '#3a9679', display: 'none' }}>
            You beat your best!
          </p>
          <p id="finalScore" ref={finalScoreValRef}>SCORE: 0</p>
          <button id="retryBtn" ref={retryBtnRef} className="popup-btn"
            style={{ background: 'var(--accent)', color: '#fff' }}>
            RETRY (SPACE)
          </button>
        </div>
      </div>

      {/* Bottom HUD: Best score */}
      <div id="hudBottom">
        <span id="hiscore" ref={hiscoreValRef}>BEST: 0</span>
      </div>

      {/* Tap-to-start message */}
      <div id="msg" ref={msgRef}>
        TAP ANYWHERE OR PRESS SPACE TO START
      </div>

    </div>
  );
}

export default App;
