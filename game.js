"use strict";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const hullValue = document.getElementById("hullValue");
const scoreValue = document.getElementById("scoreValue");
const chargeValue = document.getElementById("chargeValue");
const timerValue = document.getElementById("timerValue");
const overlay = document.getElementById("overlay");
const overlayKicker = document.getElementById("overlayKicker");
const overlayTitle = document.getElementById("overlayTitle");
const overlayText = document.getElementById("overlayText");
const startButton = document.getElementById("startButton");
const pulseButton = document.getElementById("pulseButton");
const lastResultText = document.getElementById("lastResultText");
const pilotNameInput = document.getElementById("pilotNameInput");
const bestValue = document.getElementById("bestValue");
const runsValue = document.getElementById("runsValue");
const leaderboardList = document.getElementById("leaderboardList");
const historyList = document.getElementById("historyList");
const challengeBanner = document.getElementById("challengeBanner");
const challengeText = document.getElementById("challengeText");
const shareButton = document.getElementById("shareButton");
const clearHistoryButton = document.getElementById("clearHistoryButton");

const GOAL_TIME = 90;
const HISTORY_KEY = "solar-salvager-runs-v1";
const PILOT_KEY = "solar-salvager-pilot-v1";
const MAX_HISTORY = 20;
const SHARE_BASE_URL = "https://jasonpanghf.github.io/solar-salvager/";

const keys = new Set();
const pointer = {
  active: false,
  x: 0,
  y: 0,
};

const view = {
  width: 0,
  height: 0,
  dpr: 1,
};

const starfield = [];
const records = {
  runs: [],
  lastRun: null,
};
const activeChallenge = readChallengeFromUrl();

const game = {
  state: "menu",
  elapsed: 0,
  score: 0,
  spawnTimer: 0,
  fireTimer: 0,
  particleTimer: 0,
  shake: 0,
  enemies: [],
  bullets: [],
  particles: [],
  pickups: [],
  lastFrame: 0,
};

const player = {
  x: 0,
  y: 0,
  radius: 16,
  speed: 260,
  hp: 100,
  maxHp: 100,
  invulnerable: 0,
  charge: 0,
  pulseCooldown: 0,
  angle: 0,
  trailSeed: 0,
};

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function toBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function fromBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function readChallengeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const value = params.get("challenge");

  if (!value) {
    return null;
  }

  let payload = null;

  try {
    payload = safeJsonParse(fromBase64Url(value), null);
  } catch (error) {
    return null;
  }
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const score = Number(payload.score);
  const survival = Number(payload.survival);
  if (!Number.isFinite(score) || !Number.isFinite(survival)) {
    return null;
  }

  return {
    id: "challenge",
    name: String(payload.name || "Friend").slice(0, 18),
    score: Math.max(0, Math.floor(score)),
    survival: clamp(survival, 0, GOAL_TIME),
    victory: Boolean(payload.victory),
    date: Number(payload.date) || Date.now(),
    fromChallenge: true,
  };
}

function getPilotName() {
  const value = pilotNameInput?.value.trim();
  return value ? value.slice(0, 18) : "Pilot";
}

function createRecordId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function loadRecords() {
  const saved = safeJsonParse(localStorage.getItem(HISTORY_KEY) || "[]", []);

  if (!Array.isArray(saved)) {
    records.runs = [];
    return;
  }

  records.runs = saved
    .filter((run) => run && Number.isFinite(Number(run.score)))
    .map((run) => ({
      id: String(run.id || createRecordId()),
      name: String(run.name || "Pilot").slice(0, 18),
      score: Math.max(0, Math.floor(Number(run.score))),
      survival: clamp(Number(run.survival) || 0, 0, GOAL_TIME),
      victory: Boolean(run.victory),
      hull: Math.max(0, Math.ceil(Number(run.hull) || 0)),
      date: Number(run.date) || Date.now(),
    }))
    .slice(0, MAX_HISTORY);

  records.lastRun = records.runs[0] || null;
}

function saveRecords() {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(records.runs.slice(0, MAX_HISTORY)));
}

function formatRunTime(seconds) {
  return `${Math.max(0, seconds).toFixed(1)}s`;
}

function formatRunDate(timestamp) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function compareRuns(a, b) {
  if (b.score !== a.score) {
    return b.score - a.score;
  }

  if (Number(b.victory) !== Number(a.victory)) {
    return Number(b.victory) - Number(a.victory);
  }

  return b.survival - a.survival;
}

function createRecordItem(run, label, rank) {
  const item = document.createElement("li");
  item.className = "record-item";

  const main = document.createElement("span");
  main.className = "record-main";

  const title = document.createElement("span");
  title.className = "record-title";
  title.textContent = `${rank ? `#${rank} ` : ""}${run.name} · ${run.score} pts`;

  const meta = document.createElement("span");
  meta.className = "record-meta";
  meta.textContent = `${formatRunTime(run.survival)} · ${run.victory ? "Extracted" : "Hull lost"} · ${formatRunDate(run.date)}`;

  const badge = document.createElement("span");
  badge.className = `record-badge${run.victory ? " survived" : ""}`;
  badge.textContent = label;

  main.append(title, meta);
  item.append(main, badge);
  return item;
}

function renderEmptyItem(list, text) {
  list.replaceChildren();
  const item = document.createElement("li");
  item.className = "empty-record";
  item.textContent = text;
  list.append(item);
}

function renderRecords() {
  const topRuns = [...records.runs];

  if (activeChallenge) {
    topRuns.push(activeChallenge);
  }

  const bestLocalRun = [...records.runs].sort(compareRuns)[0];
  bestValue.textContent = bestLocalRun ? bestLocalRun.score.toString() : "0";
  runsValue.textContent = records.runs.length.toString();
  shareButton.disabled = !records.lastRun;

  if (activeChallenge) {
    challengeBanner.hidden = false;
    challengeBanner.textContent = `${activeChallenge.name} challenged you: beat ${activeChallenge.score} pts in ${formatRunTime(activeChallenge.survival)}.`;
    challengeText.textContent = `Friend target: ${activeChallenge.score} pts from ${activeChallenge.name}.`;
  } else {
    challengeBanner.hidden = true;
    challengeText.textContent = "Share your best run as a challenge link after you play.";
  }

  leaderboardList.replaceChildren();
  const leaderboardRuns = topRuns.sort(compareRuns).slice(0, 5);

  if (leaderboardRuns.length === 0) {
    renderEmptyItem(leaderboardList, "Finish a run to claim the board.");
  } else {
    leaderboardRuns.forEach((run, index) => {
      leaderboardList.append(createRecordItem(run, run.fromChallenge ? "Friend" : "Local", index + 1));
    });
  }

  historyList.replaceChildren();
  const recentRuns = records.runs.slice(0, 6);

  if (recentRuns.length === 0) {
    renderEmptyItem(historyList, "No runs recorded yet.");
  } else {
    recentRuns.forEach((run) => {
      historyList.append(createRecordItem(run, run.victory ? "Win" : "Run"));
    });
  }
}

function createChallengeUrl(run) {
  const isLocalPage =
    window.location.protocol === "file:" ||
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";
  const url = new URL(isLocalPage ? SHARE_BASE_URL : window.location.href);
  const payload = {
    name: run.name,
    score: run.score,
    survival: run.survival,
    victory: run.victory,
    date: run.date,
  };

  url.searchParams.set("challenge", toBase64Url(JSON.stringify(payload)));
  return url.toString();
}

function recordRun(victory) {
  const run = {
    id: createRecordId(),
    name: getPilotName(),
    score: Math.floor(game.score),
    survival: clamp(game.elapsed, 0, GOAL_TIME),
    victory,
    hull: Math.max(0, Math.ceil(player.hp)),
    date: Date.now(),
  };

  records.runs.unshift(run);
  records.runs = records.runs.slice(0, MAX_HISTORY);
  records.lastRun = run;
  saveRecords();
  renderRecords();
  return run;
}

function getChallengeResult(run) {
  if (!activeChallenge) {
    return "Run saved to your local history.";
  }

  const difference = run.score - activeChallenge.score;
  if (difference >= 0) {
    return `Challenge beaten: you topped ${activeChallenge.name} by ${difference} pts.`;
  }

  return `${activeChallenge.name} is still ahead by ${Math.abs(difference)} pts.`;
}

function flashShareButton(text) {
  const original = "Copy Challenge Link";
  shareButton.textContent = text;
  window.setTimeout(() => {
    shareButton.textContent = original;
  }, 1400);
}

async function copyChallengeLink() {
  if (!records.lastRun) {
    return;
  }

  const url = createChallengeUrl(records.lastRun);
  const message = `${records.lastRun.name} scored ${records.lastRun.score} in Solar Salvager. Beat this: ${url}`;

  try {
    await navigator.clipboard.writeText(message);
    flashShareButton("Copied");
  } catch (error) {
    window.prompt("Copy this challenge link:", message);
    flashShareButton("Ready");
  }
}

function clearRunHistory() {
  records.runs = [];
  records.lastRun = null;
  saveRecords();
  renderRecords();
  lastResultText.textContent = "";
}

function isTypingIntoField(event) {
  return event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
}

function initRecords() {
  pilotNameInput.value = localStorage.getItem(PILOT_KEY) || "";
  pilotNameInput.addEventListener("input", () => {
    localStorage.setItem(PILOT_KEY, pilotNameInput.value.trim().slice(0, 18));
  });

  shareButton.addEventListener("click", copyChallengeLink);
  clearHistoryButton.addEventListener("click", clearRunHistory);

  loadRecords();
  renderRecords();
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  view.width = rect.width;
  view.height = rect.height;
  view.dpr = Math.min(2, window.devicePixelRatio || 1);

  canvas.width = Math.floor(rect.width * view.dpr);
  canvas.height = Math.floor(rect.height * view.dpr);
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);

  if (player.x === 0 && player.y === 0) {
    centerPlayer();
  }

  buildStarfield();
  player.x = clamp(player.x, player.radius + 14, view.width - player.radius - 14);
  player.y = clamp(player.y, player.radius + 14, view.height - player.radius - 14);
}

function centerPlayer() {
  player.x = view.width / 2;
  player.y = view.height / 2;
}

function buildStarfield() {
  const count = Math.max(48, Math.floor((view.width * view.height) / 16000));
  starfield.length = 0;

  for (let index = 0; index < count; index += 1) {
    starfield.push({
      x: Math.random() * view.width,
      y: Math.random() * view.height,
      size: randomRange(1, 3.2),
      drift: randomRange(10, 36),
      alpha: randomRange(0.18, 0.8),
    });
  }
}

function resetGame() {
  game.state = "playing";
  game.elapsed = 0;
  game.score = 0;
  game.spawnTimer = 0.2;
  game.fireTimer = 0;
  game.particleTimer = 0;
  game.shake = 0;
  game.enemies = [];
  game.bullets = [];
  game.particles = [];
  game.pickups = [];

  player.hp = 100;
  player.charge = 0;
  player.invulnerable = 0;
  player.pulseCooldown = 0;
  player.angle = -Math.PI / 2;
  player.trailSeed = 0;
  centerPlayer();
  releasePointer();

  hideOverlay();
  syncUi();
}

function syncUi() {
  hullValue.textContent = Math.max(0, Math.ceil(player.hp)).toString();
  scoreValue.textContent = Math.floor(game.score).toString();
  chargeValue.textContent = `${Math.floor(player.charge)}%`;
  timerValue.textContent = Math.max(0, GOAL_TIME - game.elapsed).toFixed(1);
  pulseButton.disabled = player.charge < 100 || game.state !== "playing";
}

function showOverlay(kicker, title, text, buttonLabel) {
  overlayKicker.textContent = kicker;
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  lastResultText.textContent = "";
  startButton.textContent = buttonLabel;
  overlay.classList.remove("is-hidden");
}

function hideOverlay() {
  overlay.classList.add("is-hidden");
}

function spawnEnemy() {
  const edge = Math.floor(Math.random() * 4);
  const padding = 30;
  let x = 0;
  let y = 0;

  if (edge === 0) {
    x = randomRange(-padding, view.width + padding);
    y = -padding;
  } else if (edge === 1) {
    x = view.width + padding;
    y = randomRange(-padding, view.height + padding);
  } else if (edge === 2) {
    x = randomRange(-padding, view.width + padding);
    y = view.height + padding;
  } else {
    x = -padding;
    y = randomRange(-padding, view.height + padding);
  }

  const progress = game.elapsed / GOAL_TIME;
  const roll = Math.random();
  let enemy;

  if (progress > 0.6 && roll > 0.72) {
    enemy = {
      kind: "crusher",
      x,
      y,
      radius: 26,
      speed: randomRange(48, 62),
      hp: 110,
      damage: 24,
      tint: "#ff9554",
      glow: "rgba(255, 149, 84, 0.3)",
      wobble: Math.random() * Math.PI * 2,
      value: 24,
    };
  } else if (progress > 0.25 && roll > 0.48) {
    enemy = {
      kind: "needle",
      x,
      y,
      radius: 11,
      speed: randomRange(120, 155),
      hp: 26,
      damage: 12,
      tint: "#8ff5ee",
      glow: "rgba(143, 245, 238, 0.35)",
      wobble: Math.random() * Math.PI * 2,
      value: 16,
    };
  } else {
    enemy = {
      kind: "drone",
      x,
      y,
      radius: 16,
      speed: randomRange(72, 96),
      hp: 46,
      damage: 16,
      tint: "#ffd18a",
      glow: "rgba(255, 209, 138, 0.28)",
      wobble: Math.random() * Math.PI * 2,
      value: 18,
    };
  }

  game.enemies.push(enemy);
}

function getMovementIntent() {
  let x = 0;
  let y = 0;

  if (keys.has("ArrowUp") || keys.has("w") || keys.has("W")) {
    y -= 1;
  }

  if (keys.has("ArrowDown") || keys.has("s") || keys.has("S")) {
    y += 1;
  }

  if (keys.has("ArrowLeft") || keys.has("a") || keys.has("A")) {
    x -= 1;
  }

  if (keys.has("ArrowRight") || keys.has("d") || keys.has("D")) {
    x += 1;
  }

  if (pointer.active) {
    const dx = pointer.x - player.x;
    const dy = pointer.y - player.y;
    const length = Math.hypot(dx, dy);

    if (length > 10) {
      x = dx / length;
      y = dy / length;
    }
  }

  const length = Math.hypot(x, y);
  if (length > 0) {
    x /= length;
    y /= length;
  }

  return { x, y };
}

function findNearestEnemy() {
  let best = null;
  let bestDistance = Infinity;

  for (const enemy of game.enemies) {
    const enemyDistance = distance(player, enemy);
    if (enemyDistance < bestDistance) {
      bestDistance = enemyDistance;
      best = enemy;
    }
  }

  return best;
}

function fireAutoShot() {
  const target = findNearestEnemy();
  if (!target) {
    return;
  }

  const dx = target.x - player.x;
  const dy = target.y - player.y;
  const length = Math.hypot(dx, dy) || 1;
  const vx = (dx / length) * 430;
  const vy = (dy / length) * 430;

  player.angle = Math.atan2(vy, vx);

  game.bullets.push({
    x: player.x + (dx / length) * 18,
    y: player.y + (dy / length) * 18,
    vx,
    vy,
    radius: 4,
    ttl: 1.25,
    damage: 24,
  });

  for (let count = 0; count < 3; count += 1) {
    game.particles.push({
      x: player.x,
      y: player.y,
      vx: randomRange(-36, 36),
      vy: randomRange(-36, 36),
      life: randomRange(0.12, 0.22),
      size: randomRange(1.5, 3.5),
      color: "rgba(143, 245, 238, 0.9)",
    });
  }
}

function triggerPulse() {
  if (player.charge < 100 || game.state !== "playing") {
    return;
  }

  player.charge = 0;
  player.pulseCooldown = 0.5;
  game.shake = Math.max(game.shake, 12);

  for (const enemy of game.enemies) {
    const dx = enemy.x - player.x;
    const dy = enemy.y - player.y;
    const range = Math.hypot(dx, dy);

    if (range < 180) {
      enemy.hp -= range < 110 ? 90 : 42;
      const nudge = range === 0 ? 1 : range;
      enemy.x += (dx / nudge) * 18;
      enemy.y += (dy / nudge) * 18;
    }
  }

  for (let burst = 0; burst < 40; burst += 1) {
    const angle = (Math.PI * 2 * burst) / 40;
    const speed = randomRange(70, 210);
    game.particles.push({
      x: player.x,
      y: player.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: randomRange(0.4, 0.7),
      size: randomRange(2, 5),
      color: burst % 2 === 0 ? "rgba(255, 208, 137, 0.85)" : "rgba(103, 227, 223, 0.85)",
    });
  }

  for (let enemyIndex = game.enemies.length - 1; enemyIndex >= 0; enemyIndex -= 1) {
    if (game.enemies[enemyIndex].hp <= 0) {
      destroyEnemy(enemyIndex);
    }
  }
}

function updatePlayer(dt) {
  const movement = getMovementIntent();
  player.x += movement.x * player.speed * dt;
  player.y += movement.y * player.speed * dt;
  player.x = clamp(player.x, player.radius + 14, view.width - player.radius - 14);
  player.y = clamp(player.y, player.radius + 14, view.height - player.radius - 14);

  if (movement.x !== 0 || movement.y !== 0) {
    player.angle = Math.atan2(movement.y, movement.x);
  }

  player.invulnerable = Math.max(0, player.invulnerable - dt);
  player.pulseCooldown = Math.max(0, player.pulseCooldown - dt);
  player.trailSeed += dt * 18;
}

function updateBullets(dt) {
  for (let index = game.bullets.length - 1; index >= 0; index -= 1) {
    const bullet = game.bullets[index];
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.ttl -= dt;

    if (
      bullet.ttl <= 0 ||
      bullet.x < -40 ||
      bullet.x > view.width + 40 ||
      bullet.y < -40 ||
      bullet.y > view.height + 40
    ) {
      game.bullets.splice(index, 1);
    }
  }
}

function updateEnemies(dt) {
  for (const enemy of game.enemies) {
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const length = Math.hypot(dx, dy) || 1;
    const sway = Math.sin(game.elapsed * 3 + enemy.wobble) * 0.12;
    enemy.x += ((dx / length) + sway) * enemy.speed * dt;
    enemy.y += ((dy / length) - sway) * enemy.speed * dt;
  }
}

function updatePickups(dt) {
  for (let index = game.pickups.length - 1; index >= 0; index -= 1) {
    const pickup = game.pickups[index];
    pickup.age += dt;
    pickup.y += Math.sin(pickup.age * 5 + pickup.seed) * 12 * dt;

    if (distance(player, pickup) < player.radius + pickup.radius + 4) {
      player.charge = Math.min(100, player.charge + pickup.value);
      game.score += 15;
      spawnBurst(pickup.x, pickup.y, 10, "rgba(255, 208, 137, 0.85)", 120);
      game.pickups.splice(index, 1);
    }
  }
}

function spawnBurst(x, y, count, color, speed) {
  for (let index = 0; index < count; index += 1) {
    const angle = randomRange(0, Math.PI * 2);
    const velocity = randomRange(speed * 0.35, speed);
    game.particles.push({
      x,
      y,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      life: randomRange(0.2, 0.6),
      size: randomRange(1.6, 4.8),
      color,
    });
  }
}

function resolveCollisions() {
  for (let bulletIndex = game.bullets.length - 1; bulletIndex >= 0; bulletIndex -= 1) {
    const bullet = game.bullets[bulletIndex];

    for (let enemyIndex = game.enemies.length - 1; enemyIndex >= 0; enemyIndex -= 1) {
      const enemy = game.enemies[enemyIndex];

      if (distance(bullet, enemy) < bullet.radius + enemy.radius) {
        enemy.hp -= bullet.damage;
        game.bullets.splice(bulletIndex, 1);
        spawnBurst(bullet.x, bullet.y, 4, "rgba(103, 227, 223, 0.85)", 80);

        if (enemy.hp <= 0) {
          destroyEnemy(enemyIndex);
        }
        break;
      }
    }
  }

  for (let enemyIndex = game.enemies.length - 1; enemyIndex >= 0; enemyIndex -= 1) {
    const enemy = game.enemies[enemyIndex];

    if (distance(player, enemy) < player.radius + enemy.radius) {
      if (player.invulnerable <= 0) {
        player.hp -= enemy.damage;
        player.invulnerable = 0.9;
        game.shake = Math.max(game.shake, 8);
        spawnBurst(player.x, player.y, 14, "rgba(255, 143, 77, 0.7)", 160);

        if (player.hp <= 0) {
          player.hp = 0;
          endRun(false);
          return;
        }
      }

      game.enemies.splice(enemyIndex, 1);
    }
  }
}

function destroyEnemy(enemyIndex) {
  const enemy = game.enemies[enemyIndex];
  game.score += enemy.value;
  spawnBurst(enemy.x, enemy.y, enemy.kind === "crusher" ? 16 : 10, enemy.glow, 150);

  if (Math.random() < 0.32 || enemy.kind === "crusher") {
    game.pickups.push({
      x: enemy.x,
      y: enemy.y,
      radius: 8,
      value: enemy.kind === "crusher" ? 40 : 24,
      age: 0,
      seed: Math.random() * Math.PI * 2,
    });
  }

  game.enemies.splice(enemyIndex, 1);
}

function endRun(victory) {
  game.state = victory ? "victory" : "gameover";
  releasePointer();
  syncUi();
  const run = recordRun(victory);

  if (victory) {
    showOverlay(
      "Extraction Open",
      "Route Cleared",
      `You made it out with ${run.score} points and ${run.hull} hull remaining.`,
      "Run It Again"
    );
  } else {
    showOverlay(
      "Hull Failure",
      "Run Lost",
      `The swarm got through after ${formatRunTime(run.survival)}. Final score: ${run.score}.`,
      "Retry Run"
    );
  }

  lastResultText.textContent = getChallengeResult(run);
}

function updateParticles(dt) {
  for (let index = game.particles.length - 1; index >= 0; index -= 1) {
    const particle = game.particles[index];
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.life -= dt;
    particle.vx *= 0.98;
    particle.vy *= 0.98;

    if (particle.life <= 0) {
      game.particles.splice(index, 1);
    }
  }
}

function update(dt) {
  if (game.state !== "playing") {
    updateParticles(dt);
    game.shake = Math.max(0, game.shake - 25 * dt);
    return;
  }

  game.elapsed += dt;
  game.score += dt * 4;

  if (game.elapsed >= GOAL_TIME) {
    endRun(true);
    return;
  }

  game.spawnTimer -= dt;
  if (game.spawnTimer <= 0) {
    spawnEnemy();
    game.spawnTimer = Math.max(0.3, 1.05 - game.elapsed * 0.008);
  }

  game.fireTimer -= dt;
  if (game.fireTimer <= 0) {
    fireAutoShot();
    game.fireTimer = 0.16;
  }

  updatePlayer(dt);
  updateBullets(dt);
  updateEnemies(dt);
  updatePickups(dt);
  resolveCollisions();
  updateParticles(dt);

  game.shake = Math.max(0, game.shake - 20 * dt);
  syncUi();
}

function drawStarfield() {
  const gradient = ctx.createLinearGradient(0, 0, 0, view.height);
  gradient.addColorStop(0, "#081420");
  gradient.addColorStop(0.45, "#0e2134");
  gradient.addColorStop(1, "#142d42");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, view.width, view.height);

  for (const star of starfield) {
    const driftY = (star.y + game.elapsed * star.drift) % view.height;
    ctx.beginPath();
    ctx.fillStyle = `rgba(255, 244, 225, ${star.alpha})`;
    ctx.arc(star.x, driftY, star.size, 0, Math.PI * 2);
    ctx.fill();
  }

  const haze = ctx.createRadialGradient(
    view.width * 0.68,
    view.height * 0.22,
    20,
    view.width * 0.68,
    view.height * 0.22,
    view.width * 0.48
  );
  haze.addColorStop(0, "rgba(255, 149, 84, 0.18)");
  haze.addColorStop(1, "rgba(255, 149, 84, 0)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, view.width, view.height);
}

function drawGrid() {
  ctx.save();
  ctx.strokeStyle = "rgba(255, 230, 173, 0.035)";
  ctx.lineWidth = 1;

  for (let x = 0; x <= view.width; x += 44) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, view.height);
    ctx.stroke();
  }

  for (let y = 0; y <= view.height; y += 44) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(view.width, y);
    ctx.stroke();
  }

  ctx.restore();
}

function drawPlayer() {
  const blink = player.invulnerable > 0 && Math.floor(player.invulnerable * 20) % 2 === 0;
  if (blink) {
    return;
  }

  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.angle + Math.PI / 2);

  const thrusterPulse = 6 + Math.sin(player.trailSeed) * 2.2;
  ctx.fillStyle = "rgba(255, 149, 84, 0.65)";
  ctx.beginPath();
  ctx.moveTo(-8, player.radius + 2);
  ctx.lineTo(0, player.radius + thrusterPulse);
  ctx.lineTo(8, player.radius + 2);
  ctx.closePath();
  ctx.fill();

  ctx.shadowColor = "rgba(103, 227, 223, 0.5)";
  ctx.shadowBlur = 22;
  ctx.fillStyle = "#8ff5ee";
  ctx.beginPath();
  ctx.moveTo(0, -player.radius - 6);
  ctx.lineTo(player.radius - 2, player.radius);
  ctx.lineTo(0, player.radius - 6);
  ctx.lineTo(-player.radius + 2, player.radius);
  ctx.closePath();
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = "#0b1420";
  ctx.beginPath();
  ctx.arc(0, 2, 6.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 244, 225, 0.6)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, -player.radius + 1);
  ctx.lineTo(0, player.radius - 2);
  ctx.stroke();
  ctx.restore();
}

function drawEnemies() {
  for (const enemy of game.enemies) {
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.shadowColor = enemy.glow;
    ctx.shadowBlur = enemy.kind === "crusher" ? 20 : 12;
    ctx.fillStyle = enemy.tint;

    if (enemy.kind === "crusher") {
      ctx.beginPath();
      ctx.arc(0, 0, enemy.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1a2533";
      ctx.beginPath();
      ctx.arc(0, 0, enemy.radius * 0.45, 0, Math.PI * 2);
      ctx.fill();
    } else if (enemy.kind === "needle") {
      ctx.rotate(game.elapsed * 2.2 + enemy.wobble);
      ctx.beginPath();
      ctx.moveTo(0, -enemy.radius - 4);
      ctx.lineTo(enemy.radius, enemy.radius);
      ctx.lineTo(-enemy.radius, enemy.radius);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.rotate(game.elapsed * 1.2 + enemy.wobble);
      ctx.beginPath();
      for (let point = 0; point < 6; point += 1) {
        const angle = (Math.PI * 2 * point) / 6;
        const radius = point % 2 === 0 ? enemy.radius : enemy.radius * 0.66;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;

        if (point === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }
}

function drawBullets() {
  ctx.fillStyle = "#b6fff2";
  for (const bullet of game.bullets) {
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPickups() {
  for (const pickup of game.pickups) {
    ctx.save();
    ctx.translate(pickup.x, pickup.y);
    ctx.rotate(game.elapsed * 2 + pickup.seed);
    ctx.shadowColor = "rgba(255, 208, 137, 0.6)";
    ctx.shadowBlur = 16;
    ctx.fillStyle = "#ffd089";
    ctx.beginPath();
    for (let point = 0; point < 4; point += 1) {
      const angle = (Math.PI / 2) * point;
      const radius = point % 2 === 0 ? pickup.radius + 2 : pickup.radius;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (point === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function drawParticles() {
  for (const particle of game.particles) {
    ctx.fillStyle = particle.color;
    ctx.globalAlpha = clamp(particle.life * 2, 0, 1);
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawPointerGuide() {
  if (!pointer.active) {
    return;
  }

  ctx.strokeStyle = "rgba(103, 227, 223, 0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(player.x, player.y);
  ctx.lineTo(pointer.x, pointer.y);
  ctx.stroke();

  ctx.fillStyle = "rgba(103, 227, 223, 0.16)";
  ctx.beginPath();
  ctx.arc(pointer.x, pointer.y, 22, 0, Math.PI * 2);
  ctx.fill();
}

function drawGoalRing() {
  const progress = clamp(game.elapsed / GOAL_TIME, 0, 1);
  const x = view.width - 72;
  const y = view.height - 76;
  const radius = 30;

  ctx.strokeStyle = "rgba(255, 246, 223, 0.2)";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "#ffd089";
  ctx.beginPath();
  ctx.arc(x, y, radius, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
  ctx.stroke();
}

function draw() {
  ctx.save();
  ctx.clearRect(0, 0, view.width, view.height);
  drawStarfield();
  drawGrid();

  if (game.shake > 0) {
    ctx.translate(randomRange(-game.shake, game.shake), randomRange(-game.shake, game.shake));
  }

  drawGoalRing();
  drawPickups();
  drawBullets();
  drawEnemies();
  drawParticles();
  drawPointerGuide();
  drawPlayer();
  ctx.restore();
}

function tick(timestamp) {
  if (!game.lastFrame) {
    game.lastFrame = timestamp;
  }

  const dt = Math.min(0.033, (timestamp - game.lastFrame) / 1000);
  game.lastFrame = timestamp;

  update(dt);
  draw();
  requestAnimationFrame(tick);
}

function handlePointer(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = event.clientX - rect.left;
  pointer.y = event.clientY - rect.top;
}

window.addEventListener("resize", resizeCanvas);

window.addEventListener("keydown", (event) => {
  if (isTypingIntoField(event)) {
    return;
  }

  if (event.code === "Space") {
    event.preventDefault();
    if (game.state === "playing") {
      triggerPulse();
    } else {
      resetGame();
    }
  }

  if (event.code === "Enter" && game.state !== "playing") {
    resetGame();
  }

  keys.add(event.key);
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key);
});

canvas.addEventListener("pointerdown", (event) => {
  pointer.active = true;
  handlePointer(event);
});

canvas.addEventListener("pointermove", (event) => {
  if (!pointer.active && event.pointerType === "mouse" && event.buttons === 0) {
    return;
  }

  handlePointer(event);
});

function releasePointer() {
  pointer.active = false;
}

canvas.addEventListener("pointerup", releasePointer);
canvas.addEventListener("pointerleave", releasePointer);
canvas.addEventListener("pointercancel", releasePointer);

startButton.addEventListener("click", resetGame);
pulseButton.addEventListener("click", triggerPulse);

initRecords();
resizeCanvas();
syncUi();
showOverlay(
  "Arcade Run",
  "Solar Salvager",
  "Survive 90 seconds, scoop up scrap capsules, and fire a shockwave when your charge hits 100%.",
  "Launch Run"
);
requestAnimationFrame(tick);
