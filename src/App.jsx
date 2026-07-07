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

// ---------- Constants ----------
const PLAYER_W = 76;
const PLAYER_H = 76;
const JUMP_DRAW_SCALE = 1.05;
const OBSTACLE_ASPECT = 346 / 327;

const W = 1000;
const H = 380;
const GROUND_Y = H - 20;

const STATIC_BG_SRC_H = 492;
const GROUND_SRC_H = 100;

const JUMP_DURATION = 52;
const JUMP_HEIGHT = 95;
const JUMP_FORWARD_BASE = 45;
const JUMP_FORWARD_SPEED_FACTOR = 9;
const RECOVER_DURATION = 20;

const SPRITE_FALLBACK_BOUNDS = {
  playerSteady: { left: 0.15, right: 0.84, top: 0.03, bottom: 0.87 },
  playerRun1: { left: 0.0, right: 1.0, top: 0.0, bottom: 1.0 },
  playerRun2: { left: 0.0, right: 1.0, top: 0.0, bottom: 1.0 },
  playerJump: { left: 0.03, right: 0.94, top: 0.09, bottom: 0.92 },
  obstacle1: { left: 0.01, right: 0.99, top: 0.02, bottom: 1.0 }
};

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
    return null; // Graceful CORS fallback for direct filesystem URLs
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
    let speed = 6;
    let frameCount = 0;
    let bgX = 0;
    let groundX = 0;
    let obstacles = [];
    let nextObstacleIn = 60;

    const BASE_X = 60;
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
      runFrame: 0
    };

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
      speed = 6;
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
      }
    }

    function makeObstacle(xPos) {
      const h = 26 + Math.random() * 24;
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
        const gap = 20 + Math.random() * 10;
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

        // 1. Draw static background (sky, mountains, trees)
        const bgSrcH = STATIC_BG_SRC_H;
        const bgDestH = GROUND_Y;
        ctx.drawImage(bgImg, 0, 0, bgImg.width, bgSrcH, 0, 0, W, bgDestH);

        // 2. Draw tiled ground
        const groundSrcY = bgImg.height - GROUND_SRC_H;
        const grSrcH = GROUND_SRC_H;
        const grDestH = H - GROUND_Y;
        const groundWidth = grDestH * (bgImg.width / grSrcH);
        const wrappedGrX = groundX % groundWidth;

        for (let x = wrappedGrX; x < W; x += groundWidth) {
          ctx.drawImage(bgImg, 0, groundSrcY, bgImg.width, grSrcH, x, GROUND_Y, groundWidth, grDestH);
        }
      } else {
        // Fallback
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
          const rp = Math.min(player.recoverTimer / RECOVER_DURATION, 1);
          player.xOffset = player.jumpForwardDist * (1 - easeInOutQuad(rp));
          if (rp >= 1) {
            player.recovering = false;
            player.xOffset = 0;
          }
        }
        player.x = BASE_X + player.xOffset;

        // Spawn obstacles
        nextObstacleIn--;
        if (nextObstacleIn <= 0) {
          spawnObstacle();
          const SAFE_MIN_GAP = JUMP_DURATION + RECOVER_DURATION + 20;
          nextObstacleIn = Math.max(SAFE_MIN_GAP, 170 + Math.random() * 90 - speed * 8);
        }
        obstacles.forEach(o => o.x -= speed);
        obstacles = obstacles.filter(o => o.x + o.w > 0);

        // Collisions
        const playerState = getPlayerRenderState();
        for (const o of obstacles) {
          if (collides(playerState, playerState.img, o, o.img)) {
            endGame();
            break;
          }
        }

        // Scoring
        score += speed * 0.05;
        speed += 0.0008;

        if (scoreValRef.current) scoreValRef.current.textContent = "SCORE: " + Math.floor(score);
        if (hiscoreValRef.current) hiscoreValRef.current.textContent = "BEST: " + hiscore;
      }

      // Draw player
      const drawState = getPlayerRenderState();
      if (drawState.img) {
        ctx.drawImage(drawState.img, drawState.x, drawState.y, drawState.w, drawState.h);
      } else {
        drawPlaceholderPlayer(player.x, player.y, player.w, player.h, player.jumping);
      }

      // Draw obstacles
      obstacles.forEach(o => {
        if (o.img) {
          ctx.drawImage(o.img, o.x, o.y, o.w, o.h);
        } else {
          drawPlaceholderObstacle(o);
        }
      });

      animationFrameId = requestAnimationFrame(update);
    }

    // Input bindings
    const handleKeyDown = (e) => {
      if (e.code === "Space") {
        e.preventDefault();
        jump();
      }
    };
    const handleMouseDown = () => {
      jump();
    };
    const handleTouchStart = (e) => {
      if (e.target.tagName !== "BUTTON") {
        e.preventDefault();
      }
      jump();
    };

    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("touchstart", handleTouchStart, { passive: false });

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
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("touchstart", handleTouchStart);
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
      <div id="hud" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '20px' }}>
          <span id="score" ref={scoreValRef}>SCORE: 0</span>
          <span id="hiscore" ref={hiscoreValRef}>BEST: 0</span>
        </div>
        <button id="settingsBtn" ref={settingsBtnRef} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '20px' }}>⚙️</button>
      </div>
      <div id="gameContainer" style={{ position: 'relative', display: 'inline-block' }}>
        <canvas id="game" ref={canvasRef} width={W} height={H}></canvas>

        {/* Settings Popup Overlay */}
        <div
          id="settingsOverlay"
          ref={settingsOverlayRef}
          style={{
            display: 'none',
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(255, 255, 255, 0.95)',
            border: '3px solid var(--ink)',
            padding: '20px 30px',
            textAlign: 'center',
            boxShadow: '5px 5px 0px var(--ink)',
            zIndex: 20
          }}
        >
          <h2 style={{ margin: '0 0 15px 0', color: 'var(--ink)', fontFamily: 'inherit', fontSize: '20px' }}>SETTINGS</h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '20px', textAlign: 'left', fontFamily: 'inherit', fontSize: '14px', fontWeight: 'bold' }}>
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Volume</span>
              <input type="range" ref={volumeSliderRef} min="0" max="1" step="0.1" style={{ width: '100px' }} />
            </label>
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Mute</span>
              <input type="checkbox" ref={muteCheckboxRef} style={{ width: '18px', height: '18px' }} />
            </label>
          </div>

          <button
            ref={closeSettingsBtnRef}
            style={{
              fontFamily: 'inherit',
              fontSize: '13px',
              fontWeight: 'bold',
              padding: '8px 16px',
              background: 'var(--ink)',
              color: '#fff',
              border: '2px solid var(--ink)',
              cursor: 'pointer',
              boxShadow: '2px 2px 0px var(--ink)'
            }}
          >
            CLOSE
          </button>
        </div>

        {/* Game Over Popup Overlay */}
        <div
          id="gameOverOverlay"
          ref={gameOverOverlayRef}
          style={{
            display: 'none',
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(255, 255, 255, 0.95)',
            border: '3px solid var(--ink)',
            padding: '20px 30px',
            textAlign: 'center',
            boxShadow: '5px 5px 0px var(--ink)',
            zIndex: 10
          }}
        >
          <h2
            style={{
              margin: '0 0 10px 0',
              color: 'var(--accent)',
              fontFamily: 'inherit',
              fontSize: '24px',
              letterSpacing: '1px'
            }}
          >
            GAME OVER
          </h2>
          <p
            id="bestScoreMsg"
            ref={bestScoreMsgRef}
            style={{
              fontFamily: 'inherit',
              fontSize: '14px',
              color: '#3a9679',
              margin: '0 0 10px 0',
              fontWeight: 'bold',
              display: 'none'
            }}
          >
            You beat your best!
          </p>
          <p
            id="finalScore"
            ref={finalScoreValRef}
            style={{
              fontFamily: 'inherit',
              fontSize: '16px',
              margin: '0 0 15px 0',
              fontWeight: 'bold'
            }}
          >
            SCORE: 0
          </p>
          <button
            id="retryBtn"
            ref={retryBtnRef}
            style={{
              fontFamily: 'inherit',
              fontSize: '13px',
              fontWeight: 'bold',
              padding: '8px 16px',
              background: 'var(--accent)',
              color: '#fff',
              border: '2px solid var(--ink)',
              cursor: 'pointer',
              boxShadow: '2px 2px 0px var(--ink)'
            }}
          >
            RETRY (SPACE)
          </button>
        </div>
      </div>
      <div id="msg" ref={msgRef}>
        Press SPACE or tap the game to jump. Press SPACE to start.
      </div>
    </div>
  );
}

export default App;
