/* VOIDSTORM 2 — fixed-step simulation, bounded encounters, sprite atlas renderer. */
'use strict';
const { SHIPS, ENEMIES, MODULES, MAX_LEVEL, MAX_UPGRADE, clamp } = Balance;
const W = 600, H = 1066, STEP = 1000 / 60;
const $ = id => document.getElementById(id);
const canvas = $('gameCanvas'), ctx = canvas.getContext('2d', { alpha: false });
const fmt = n => Math.floor(n).toLocaleString('ru-RU');
const clockText = ms => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
const dateKey = () => new Date().toDateString();
const randomBetween = (min, max) => min + Math.random() * (max - min);
const safeParse = value => { try { return JSON.parse(value); } catch { return null; } };
function localGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function localSet(key, value) { try { localStorage.setItem(key, value); return true; } catch { return false; } }
let toastTimer;
function toast(text) { $('toast').textContent = text; $('toast').classList.remove('hidden'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.add('hidden'), 3500); }

const settings = { sfx: true, music: true, shake: !matchMedia('(prefers-reduced-motion: reduce)').matches, ...(safeParse(localGet('voidstorm_settings')) || {}) };
const Audio = {
  context: null, unlocked: false, lastShot: 0,
  unlock() { this.unlocked = true; this.music(); },
  music() { const el = $('bgMusic'); el.volume = .23; if (settings.music && this.unlocked && !document.hidden) el.play().catch(() => {}); else el.pause(); },
  play(type) {
    if (!settings.sfx || !this.unlocked) return;
    const now = performance.now();
    if (type === 'shoot' && now - this.lastShot < 105) return;
    if (type === 'shoot') this.lastShot = now;
    try {
      this.context ||= new (window.AudioContext || window.webkitAudioContext)();
      if (this.context.state === 'suspended') this.context.resume();
      const ac = this.context, osc = ac.createOscillator(), gain = ac.createGain(), t = ac.currentTime;
      const sounds = { shoot: [600, 190, .045, .025, 'triangle'], hit: [120, 55, .10, .09, 'triangle'], explode: [95, 25, .18, .07, 'sawtooth'], powerup: [450, 950, .20, .06, 'sine'], ui: [640, 840, .05, .025, 'sine'] };
      const [start, end, duration, volume, wave] = sounds[type] || sounds.ui;
      osc.type = wave; osc.frequency.setValueAtTime(start, t); osc.frequency.exponentialRampToValueAtTime(end, t + duration);
      gain.gain.setValueAtTime(volume, t); gain.gain.exponentialRampToValueAtTime(.001, t + duration);
      osc.connect(gain); gain.connect(ac.destination); osc.start(t); osc.stop(t + duration);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    } catch { /* Sound must never prevent a flight. */ }
  }
};

const Save = {
  data: Balance.migrate(safeParse(localGet('voidstorm_save'))), userId: null, timer: null, cloudPending: false, cloudDirty: false, warned: false,
  key() { return this.userId ? `voidstorm_data_${this.userId}` : 'voidstorm_save'; },
  persist(immediate = false) {
    if (!immediate) { if (!this.timer) this.timer = setTimeout(() => this.persist(true), 1800); return; }
    clearTimeout(this.timer); this.timer = null;
    if (!localSet(this.key(), JSON.stringify(this.data)) && !this.warned) { this.warned = true; toast('Хранилище недоступно. Прогресс сохраняется только до закрытия игры.'); }
    this.cloudDirty = true; this.flushCloud();
  },
  async flushCloud() {
    if (!this.userId || this.cloudPending || !this.cloudDirty) return;
    this.cloudPending = true; this.cloudDirty = false;
    try { await window.vkBridge.send('VKWebAppStorageSet', { key: this.key(), value: JSON.stringify(this.data) }); }
    catch { this.cloudDirty = true; }
    finally { this.cloudPending = false; }
  }
};
// Keep an untouched legacy save once, in addition to the original source backup.
if (!localGet('voidstorm_save_before_v2') && localGet('voidstorm_save')) localSet('voidstorm_save_before_v2', localGet('voidstorm_save'));
const VK = {
  async init() {
    if (!new URLSearchParams(location.search).has('vk_app_id') && !window.vkBridge) return;
    const timeout = promise => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('VK timeout')), 3500))]);
    try {
      if (!window.vkBridge) await timeout(new Promise((resolve, reject) => { const s = document.createElement('script'); s.src = 'https://unpkg.com/@vkontakte/vk-bridge/dist/browser.min.js'; s.onload = resolve; s.onerror = reject; document.head.appendChild(s); }));
      await timeout(window.vkBridge.send('VKWebAppInit'));
      const user = await timeout(window.vkBridge.send('VKWebAppGetUserInfo'));
      const key = `voidstorm_data_${user.id}`;
      const cloud = await timeout(window.vkBridge.send('VKWebAppStorageGet', { keys: [key] }));
      const loaded = safeParse(cloud.keys?.[0]?.value) || safeParse(localGet(key));
      // Never replace a running flight or purchases made while the bridge was loading.
      if (sessionChanged) { toast('Облачный профиль будет доступен при следующем запуске.'); return; }
      Save.userId = user.id; if (loaded) { if (!localGet(`${key}_before_v2`)) localSet(`${key}_before_v2`, JSON.stringify(loaded)); Save.data = Balance.migrate(loaded); }
      Missions.check(); renderMenu(); Daily.check();
      window.vkBridge.subscribe(e => { if (e.detail.type === 'VKWebAppViewHide') { pauseGame(); $('bgMusic').pause(); } if (e.detail.type === 'VKWebAppViewRestore') Audio.music(); });
    } catch { /* Local play and its save remain fully available. */ }
  }
};

const Atlas = {
  image: new Image(), ready: false, error: false,
  draw(c, index, x, y, size, rotation = 0) {
    if (!this.ready) return;
    const cell = this.image.width / 5;
    c.save(); c.translate(x, y); if (rotation) c.rotate(rotation);
    c.drawImage(this.image, (index % 5) * cell, Math.floor(index / 5) * cell, cell, cell, -size / 2, -size / 2, size, size); c.restore();
  },
  init() {
    this.image.onload = () => { this.ready = true; $('assetStatus').textContent = 'СИСТЕМЫ ГОТОВЫ'; renderMenu(); renderShop(); renderModules(); };
    this.image.onerror = () => { this.error = true; $('assetStatus').textContent = 'АТЛАС НЕ НАЙДЕН'; toast('Не найден assets/voidstorm-atlas.png. Проверьте папку assets.'); };
    this.image.src = 'assets/voidstorm-atlas.png';
  }
};

const Missions = {
  names: { kill_drone: 'Уничтожить дронов', kill_fighter: 'Уничтожить истребителей', score_run: 'Набрать очки за один полёт', play_time: 'Провести в полёте минуты', collect_money: 'Заработать кредиты в полёте' },
  check() {
    if (Date.now() - Save.data.missions.lastGen < 86400000 && Save.data.missions.list.length === 3) return;
    const pool = [ ['kill_drone', 22], ['score_run', 2000], ['play_time', 5], ['collect_money', 350] ];
    if (Save.data.campaignLevel >= 4) pool.push(['kill_fighter', 12]);
    const list = [];
    while (list.length < 3) {
      const [id, base] = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      list.push({ id, target: Math.round(base * randomBetween(1, 1.4)), current: 0, reward: 250 + Math.min(40, Save.data.campaignLevel) * 25, claimed: false });
    }
    Save.data.missions = { lastGen: Date.now(), list }; Save.persist();
  },
  update(id, amount) {
    let changed = false;
    for (const m of Save.data.missions.list) {
      if (m.id !== id || m.claimed || m.current >= m.target) continue;
      m.current = Math.min(m.target, id === 'score_run' ? Math.max(m.current, amount) : m.current + amount); changed = true;
    }
    if (changed) Save.persist();
  },
  render() {
    this.check(); const root = $('missionsList'); root.replaceChildren();
    Save.data.missions.list.forEach((m, i) => {
      const el = document.createElement('article'); el.className = 'mission-item';
      el.innerHTML = `<h3>${this.names[m.id]}</h3><div class="mission-meta"><span>${Math.floor(m.current)} / ${m.target}${m.id === 'play_time' ? ' мин' : ''}</span><b class="gold">+${fmt(m.reward)} ◈</b></div><div class="mission-progress"><i style="width:${Math.min(100, m.current / m.target * 100)}%"></i></div>`;
      if (m.claimed) { const label = document.createElement('span'); label.className = 'claimed'; label.textContent = '✓ НАГРАДА ПОЛУЧЕНА'; el.append(label); }
      else { const button = document.createElement('button'); button.className = 'btn full'; button.textContent = m.current >= m.target ? 'ПОЛУЧИТЬ НАГРАДУ' : 'В ПРОЦЕССЕ'; button.disabled = m.current < m.target; button.onclick = () => {
        const mission = Save.data.missions.list[i]; if (!mission || mission.claimed || mission.current < mission.target) return;
        mission.claimed = true; Save.data.credits += mission.reward; sessionChanged = true; Save.persist(true); Audio.play('powerup'); this.render(); renderMenu();
      }; el.append(button); } root.append(el);
    });
  }
};
const Daily = {
  rewards: [100, 200, 300, 400, 500, 750, 1000],
  check() {
    if (Save.data.daily.last === dateKey() || run.active) { $('dailyModal').classList.add('hidden'); return; }
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    if (Save.data.daily.last !== yesterday.toDateString()) Save.data.daily.streak = 0;
    $('dailyGrid').innerHTML = this.rewards.map((r, i) => `<div class="daily-item ${i === Save.data.daily.streak ? 'active' : i < Save.data.daily.streak ? 'claimed' : ''}"><small>ДЕНЬ ${i + 1}</small><strong>${r}</strong><small>КРЕДИТОВ</small></div>`).join('');
    $('dailyModal').classList.remove('hidden');
  },
  claim() {
    if (Save.data.daily.last === dateKey()) return;
    Save.data.credits += this.rewards[Save.data.daily.streak]; Save.data.daily.last = dateKey(); Save.data.daily.streak = (Save.data.daily.streak + 1) % 7;
    sessionChanged = true; Save.persist(true); Audio.play('powerup'); $('dailyModal').classList.add('hidden'); renderMenu();
  }
};

let sessionChanged = false, shopIndex = Save.data.currentShip, selectedLevel = Save.data.campaignLevel;
let run = { active: false, paused: false, mode: 'MENU', time: 0 };
let player = null, enemies = [], bullets = [], enemyBullets = [], pickups = [], particles = [], texts = [];
let accumulator = 0, lastFrame = 0, hudTimer = 0, previewTimer = 0;
const input = { keys: new Set(), pointer: null, lastX: 0, lastY: 0 };
const stars = Array.from({ length: 100 }, () => ({ x: Math.random() * W, y: Math.random() * H, z: randomBetween(.2, 1), r: randomBetween(.5, 1.7) }));
function addText(x, y, text, color = '#98e6ec') { texts.push({ x, y, text, color, life: 1.3 }); if (texts.length > 18) texts.shift(); }
function explosion(x, y, color, count = 13) {
  for (let i = 0; i < count && particles.length < 220; i++) { const angle = Math.random() * Math.PI * 2, speed = randomBetween(35, 170); particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: randomBetween(.3, .65), color }); }
}
function banner(title, subtitle, duration = 2300) { $('waveBanner').querySelector('b').textContent = title; $('waveBanner').querySelector('span').textContent = subtitle; run.bannerUntil = run.time + duration; }

class Player {
  constructor() {
    this.stats = Balance.stats(Save.data.currentShip, Save.data.fleetUpgrades);
    this.x = W / 2; this.y = H - 150; this.targetX = this.x; this.targetY = this.y;
    this.hp = this.stats.hp; this.maxHp = this.hp; this.radius = 12; this.iframe = 1800; this.shotTimer = 0;
    this.boosts = { overdrive: 0, multishot: 0, shield: 0 };
  }
  update(dt) {
    const s = dt / 1000;
    let kx = Number(input.keys.has('ArrowRight') || input.keys.has('KeyD')) - Number(input.keys.has('ArrowLeft') || input.keys.has('KeyA'));
    let ky = Number(input.keys.has('ArrowDown') || input.keys.has('KeyS')) - Number(input.keys.has('ArrowUp') || input.keys.has('KeyW'));
    if (kx || ky) { const length = Math.hypot(kx, ky); this.targetX = this.x + kx / length * this.stats.speed * s; this.targetY = this.y + ky / length * this.stats.speed * s; }
    this.targetX = clamp(this.targetX, 28, W - 28); this.targetY = clamp(this.targetY, 100, H - 42);
    const dx = this.targetX - this.x, dy = this.targetY - this.y, distance = Math.hypot(dx, dy), move = Math.min(distance, this.stats.speed * s);
    if (distance > .01) { this.x += dx / distance * move; this.y += dy / distance * move; }
    this.iframe = Math.max(0, this.iframe - dt);
    for (const type in this.boosts) this.boosts[type] = Math.max(0, this.boosts[type] - dt);
    this.shotTimer -= dt;
    if (this.shotTimer <= 0) { this.shoot(); this.shotTimer += this.stats.interval / (this.boosts.overdrive > 0 ? 1.6 : 1); }
  }
  shoot() {
    if (bullets.length > 160) return;
    Audio.play('shoot');
    const s = this.stats, damage = s.dps * s.interval / 1000;
    const patterns = { single: [0], double: [-9, 9], spread: [-14, 0, 14], sniper: [0], rapid: [0], homing: [-8, 8], omega: [-11, 11], lance: [-15, 0, 15], storm: [-15, 0, 15], nova: [-22, -13, -4, 4, 13, 22] };
    const offsets = patterns[s.weapon];
    offsets.forEach(off => bullets.push(new Bullet(this.x + off, this.y - 29, 0, s.weapon === 'sniper' ? -1050 : -780, damage / offsets.length, s.color, { homing: ['homing', 'storm', 'nova'].includes(s.weapon), pierce: ['sniper', 'lance'].includes(s.weapon) ? 3 : 1, width: s.weapon === 'sniper' ? 7 : 4 })));
    if (this.boosts.multishot > 0) for (const side of [-1, 1]) bullets.push(new Bullet(this.x + side * 22, this.y - 20, side * 90, -760, damage * .35, '#85ecff', { homing: true }));
  }
  hit(damage) {
    if (!run.active || this.iframe > 0 || this.boosts.shield > 0) return;
    this.hp = Math.max(0, this.hp - damage); this.iframe = 1000; run.shake = settings.shake ? 12 : 0; run.flash = 180; Audio.play('hit');
    if (this.hp <= 0) { explosion(this.x, this.y, this.stats.color, 35); finishRun(false); }
  }
  collect(type) {
    Audio.play('powerup');
    if (type === 'health') this.hp = Math.min(this.maxHp, this.hp + this.maxHp * .35);
    else this.boosts[type] = Math.min(MODULES[type].duration * 1.5, this.boosts[type] + MODULES[type].duration);
    addText(this.x, this.y - 52, MODULES[type].name, MODULES[type].color);
  }
  draw(c) {
    c.save(); if (this.iframe > 0 && Math.floor(run.time / 90) % 2) c.globalAlpha = .5;
    const engine = 20 + Math.sin(run.time * .04) * 5;
    const glow = c.createLinearGradient(0, this.y + 22, 0, this.y + 22 + engine);
    glow.addColorStop(0, '#7aeeffbb'); glow.addColorStop(1, '#60cfff00'); c.fillStyle = glow; c.fillRect(this.x - 5, this.y + 22, 10, engine);
    Atlas.draw(c, this.stats.id, this.x, this.y, 88); c.restore();
    if (this.boosts.shield > 0) { c.strokeStyle = '#8fc3ff99'; c.lineWidth = 2; c.beginPath(); c.arc(this.x, this.y, 44 + Math.sin(run.time * .004) * 2, 0, Math.PI * 2); c.stroke(); }
    c.fillStyle = '#d8ffff'; c.beginPath(); c.arc(this.x, this.y, 3, 0, Math.PI * 2); c.fill();
  }
}
class Bullet {
  constructor(x, y, vx, vy, damage, color, options = {}) { Object.assign(this, { x, y, vx, vy, damage, color, active: true, life: 0, width: 4, homing: false, pierce: 1, enemy: false }, options); this.hits = new Set(); this.prevX = x; this.prevY = y; }
  update(dt) {
    const s = dt / 1000; this.prevX = this.x; this.prevY = this.y; this.life += dt;
    if (this.homing) {
      let target = null, nearest = Infinity;
      for (const e of enemies) if (e.active && e.y > 0 && e.y < this.y + 30 && !this.hits.has(e)) { const d = Math.hypot(e.x - this.x, e.y - this.y); if (d < nearest) { target = e; nearest = d; } }
      if (target) { const angle = Math.atan2(target.y - this.y, target.x - this.x); const factor = Math.min(1, s * 6); this.vx += (Math.cos(angle) * 780 - this.vx) * factor; this.vy += (Math.sin(angle) * 780 - this.vy) * factor; }
    }
    this.x += this.vx * s; this.y += this.vy * s;
    if (this.x < -60 || this.x > W + 60 || this.y < -80 || this.y > H + 80 || this.life > 8500) this.active = false;
  }
  draw(c) {
    c.save(); c.translate(this.x, this.y); c.rotate(Math.atan2(this.vy, this.vx) + Math.PI / 2);
    c.fillStyle = this.color;
    if (this.enemy) { c.beginPath(); c.ellipse(0, 0, this.width + 1, this.width + 4, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = '#ffe7dc'; c.fillRect(-1, -2, 2, 4); }
    else { c.fillRect(-this.width / 2, -10, this.width, this.pierce > 1 ? 30 : 20); c.fillStyle = '#e8ffff'; c.fillRect(-1, -9, 2, 12); } c.restore();
  }
}
class Enemy {
  constructor(type, config, x) {
    this.type = type; this.def = ENEMIES[type]; this.active = true; this.age = 0; this.x = x ?? randomBetween(48, W - 48); this.originX = this.x; this.y = -65;
    this.radius = this.def.radius; this.maxHp = this.def.hp * config.scale; this.hp = this.maxHp;
    this.speed = this.def.speed * config.speedMult; this.config = config; this.phase = Math.random() * 6.28;
    this.shotTimer = this.def.rate ? this.def.rate * randomBetween(.85, 1.25) : Infinity;
    this.warning = 0; this.aim = Math.PI / 2; this.hitFlash = 0;
    if (type === 'boss') { this.x = W / 2; this.y = -120; this.maxHp = (220 + config.level * 24) * config.scale; this.hp = this.maxHp; }
  }
  update(dt) {
    const s = dt / 1000; this.age += dt; this.hitFlash = Math.max(0, this.hitFlash - dt);
    if (this.type === 'boss') { this.y = Math.min(190, this.y + 85 * s); this.x = W / 2 + Math.sin(this.age * .0005) * 145; }
    else {
      // Separate total age from the firing cooldown: snipers always leave their perch.
      const holding = this.type === 'sniper' && this.y >= 200 && this.age < 6500;
      if (!holding) this.y += this.speed * s;
      if (this.type === 'drone' || this.type === 'guardian') this.x = clamp(this.originX + Math.sin(this.age * .0016 + this.phase) * 38, 35, W - 35);
      if (this.type === 'hunter' && this.y < H - 260) this.x += clamp(player.x - this.x, -100, 100) * s * .7;
      if (this.type === 'scout') this.x = clamp(this.originX + Math.sin(this.age * .002 + this.phase) * 55, 30, W - 30);
    }
    if (this.y > 55 && this.y < H - 180 && this.def.rate) {
      this.shotTimer -= dt;
      if (this.warning > 0) { this.warning -= dt; if (this.warning <= 0) { this.shoot(); this.shotTimer = this.def.rate; } }
      else if (this.shotTimer <= 0 && player.y > this.y + 80) {
        this.warning = this.type === 'sniper' ? 1000 : this.type === 'boss' ? 900 : 700;
        // Lock the aim at warning start, so an evasive move remains meaningful.
        this.aim = Math.atan2(player.y - this.y, player.x - this.x);
      }
    }
    if (this.type !== 'boss' && (this.y > H + 90 || this.age > 21000)) { this.active = false; run.escaped++; run.resolved++; }
  }
  shoot() {
    if (!this.active || !run.active) return;
    const boss = this.type === 'boss', speed = this.type === 'sniper' ? 315 : boss ? 210 : 205;
    let offsets = [0];
    if (['tank', 'elite', 'guardian'].includes(this.type)) offsets = [-.16, .16];
    if (this.type === 'bomber') offsets = [-.32, 0, .32];
    if (boss) offsets = this.hp < this.maxHp * .5 ? [-.6, -.3, 0, .3, .6] : [-.45, 0, .45];
    for (const off of offsets) if (enemyBullets.length < this.config.bulletCap) enemyBullets.push(new Bullet(this.x, this.y + this.radius * .6, Math.cos(this.aim + off) * speed, Math.sin(this.aim + off) * speed, this.config.damage * (boss ? 1.15 : 1), '#ff967a', { enemy: true, width: boss ? 5 : 4 }));
  }
  hit(damage) {
    if (!this.active) return;
    this.hp -= damage; this.hitFlash = 80;
    if (this.hp > 0) return;
    this.active = false; run.kills++; run.resolved++; if (this.type !== 'boss') run.regularKills++;
    run.score += this.def.score; run.credits += this.def.credits;
    Missions.update('kill_' + this.type, 1); Missions.update('collect_money', this.def.credits);
    explosion(this.x, this.y, this.def.color, this.type === 'boss' ? 45 : 14); Audio.play('explode');
    if (this.type === 'boss') { run.bossKilled = true; enemyBullets = []; dropModule(this.x, this.y, 'shield'); }
    else if (Math.random() < .13 && run.time - run.lastDrop > 2500) dropModule(this.x, this.y);
  }
  draw(c) {
    const size = this.type === 'boss' ? 195 : this.radius * 2.7;
    if (this.warning > 0) {
      c.save(); c.strokeStyle = this.type === 'sniper' ? '#ff668b99' : '#ffb07555'; c.setLineDash([10, 14]); c.lineWidth = this.type === 'sniper' ? 2 : 1;
      c.beginPath(); c.moveTo(this.x, this.y + 12); c.lineTo(this.x + Math.cos(this.aim) * H, this.y + Math.sin(this.aim) * H); c.stroke(); c.restore();
      c.strokeStyle = '#ffab8c'; c.lineWidth = 2; c.beginPath(); c.arc(this.x, this.y, this.radius + 9, 0, Math.PI * 2); c.stroke();
    }
    Atlas.draw(c, this.def.sprite, this.x, this.y, size, Math.PI);
    if (this.hitFlash > 0) { c.fillStyle = '#ffffff88'; c.beginPath(); c.arc(this.x, this.y, 6, 0, Math.PI * 2); c.fill(); }
    if (this.hp < this.maxHp && this.type !== 'boss') { c.fillStyle = '#192a3e'; c.fillRect(this.x - 18, this.y - this.radius - 12, 36, 3); c.fillStyle = this.def.color; c.fillRect(this.x - 18, this.y - this.radius - 12, 36 * Math.max(0, this.hp / this.maxHp), 3); }
  }
}
function dropModule(x, y, forced) {
  if (pickups.length >= 5) return;
  let type = forced;
  if (!type) { const roll = Math.random(); type = player.hp < player.maxHp * .6 && roll < .55 ? 'health' : ['health', 'overdrive', 'multishot', 'shield'][Math.floor(Math.random() * 4)]; }
  pickups.push({ x, y, type, age: 0, active: true }); run.lastDrop = run.time;
}

const Director = {
  beginWave() {
    if (!run.active) return;
    if (run.mode === 'ENDLESS') run.config = Balance.survival(run.wave);
    const c = run.config;
    run.phase = 'combat'; run.spawnTimer = 900; run.waveStarted = run.time;
    run.queue = Balance.waveTypes(c, run.wave); run.waveTotal = run.queue.length; run.waveResolvedStart = run.resolved;
    run.planned += run.queue.length;
    run.bossPending = c.boss && (run.mode === 'ENDLESS' || run.wave === c.waves);
    run.bossKilled = false; run.bossSpawned = false;
    banner(run.mode === 'CAMPAIGN' ? `ВОЛНА ${run.wave} / ${c.waves}` : `ВОЛНА ${run.wave}`, run.bossPending ? 'Тяжёлый сигнал в конце волны' : run.wave === 1 ? 'Удачного полёта, пилот' : 'Все системы готовы');
  },
  update(dt) {
    if (run.phase === 'rest') { run.restTimer -= dt; if (run.restTimer <= 0) this.beginWave(); return; }
    const c = run.config;
    run.spawnTimer -= dt;
    if (run.queue.length && run.spawnTimer <= 0) {
      // Find an affordable enemy without blocking the queue on a heavy unit.
      const index = run.queue.findIndex(type => Balance.canSpawn(type, enemies, c));
      if (index >= 0) { const type = run.queue.splice(index, 1)[0]; enemies.push(new Enemy(type, c)); run.spawnTimer = c.interval; }
      else run.spawnTimer = 180;
    }
    const alive = enemies.some(e => e.active);
    if (!run.queue.length && !alive) {
      if (run.bossPending && !run.bossSpawned) {
        run.bossSpawned = true; run.phase = 'boss'; enemies.push(new Enemy('boss', c)); enemyBullets = [];
        banner('ТЯЖЁЛЫЙ КОНТАКТ', 'Уклоняйтесь после появления линии прицеливания', 3000); return;
      }
      if (run.bossPending && !run.bossKilled) return;
      enemyBullets = [];
      if (run.mode === 'CAMPAIGN' && run.wave >= c.waves) { finishRun(run.regularKills / Math.max(1, run.planned) >= .6, 'coverage'); return; }
      if (run.mode === 'ENDLESS') { const bonus = 60 + Math.min(30, run.wave) * 15; run.credits += bonus; Missions.update('collect_money', bonus); }
      run.wave++; run.phase = 'rest'; run.restTimer = 4300;
      player.hp = Math.min(player.maxHp, player.hp + player.maxHp * .08); player.iframe = Math.max(player.iframe, 1500);
      dropModule(W / 2, H * .58, run.wave % 3 === 0 ? 'overdrive' : 'health');
      banner('ПЕРЕДЫШКА', 'Броня +8% · Подберите модуль снабжения', 3800);
    }
  }
};
// Swept collision prevents fast projectiles from skipping targets between frames.
function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, d = dx * dx + dy * dy;
  const t = d ? clamp(((px - ax) * dx + (py - ay) * dy) / d, 0, 1) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
function simulate(dt) {
  if (!run.active || run.paused) return;
  const s = dt / 1000; run.time += dt; run.shake *= .87; run.flash = Math.max(0, run.flash - dt);
  player.update(dt); Director.update(dt); if (!run.active) return;
  for (const list of [enemies, bullets, enemyBullets]) for (const entity of list) if (entity.active) entity.update(dt);
  for (const b of bullets) {
    if (!b.active) continue;
    for (const e of enemies) {
      if (!b.active || !e.active || b.hits.has(e)) continue;
      if (segmentDistance(e.x, e.y, b.prevX, b.prevY, b.x, b.y) < e.radius + b.width / 2) {
        b.hits.add(e); e.hit(b.damage); b.pierce--; if (b.pierce <= 0) b.active = false;
      }
    }
  }
  for (const b of enemyBullets) if (b.active && segmentDistance(player.x, player.y, b.prevX, b.prevY, b.x, b.y) < player.radius + b.width) { b.active = false; player.hit(b.damage); if (!run.active) return; }
  for (const e of enemies) if (e.active && Math.hypot(e.x - player.x, e.y - player.y) < e.radius + player.radius) {
    player.hit(run.config.damage * 2.2);
    if (e.type !== 'boss') { e.active = false; run.escaped++; run.resolved++; explosion(e.x, e.y, e.def.color); }
    if (!run.active) return;
  }
  for (const p of pickups) {
    p.age += dt; p.y += 88 * s;
    const distance = Math.hypot(p.x - player.x, p.y - player.y);
    if (distance < 120) { p.x += (player.x - p.x) * s * 4; p.y += (player.y - p.y) * s * 4; }
    if (distance < 38) { p.active = false; player.collect(p.type); }
    if (p.y > H + 45 || p.age > 14000) p.active = false;
  }
  enemies = enemies.filter(e => e.active); bullets = bullets.filter(b => b.active); enemyBullets = enemyBullets.filter(b => b.active); pickups = pickups.filter(p => p.active);
  for (const p of particles) { p.x += p.vx * s; p.y += p.vy * s; p.life -= s; }
  for (const t of texts) { t.y -= 32 * s; t.life -= s; }
  particles = particles.filter(p => p.life > 0); texts = texts.filter(t => t.life > 0);
  Save.data.stats.totalPlayTime += dt; run.missionTimer += dt;
  if (run.missionTimer >= 1000) { Missions.update('play_time', run.missionTimer / 60000); Missions.update('score_run', run.score); run.missionTimer = 0; }
}
function advance(elapsed) {
  if (!run.active || run.paused) { accumulator = 0; return; }
  accumulator += Math.min(250, Math.max(0, elapsed));
  while (accumulator >= STEP) { simulate(STEP); accumulator -= STEP; }
}

function startRun(mode, level = Save.data.campaignLevel) {
  if (!Atlas.ready) { toast(Atlas.error ? 'Проверьте наличие файла атласа в папке assets.' : 'Атлас ещё загружается. Подождите немного.'); return; }
  sessionChanged = true; Audio.unlock(); Missions.check();
  const safeLevel = clamp(Math.floor(level), 1, Save.data.campaignLevel);
  run = { active: true, paused: false, mode, level: safeLevel, wave: 1, config: mode === 'CAMPAIGN' ? Balance.campaign(safeLevel) : Balance.survival(1),
    time: 0, score: 0, credits: 0, kills: 0, regularKills: 0, escaped: 0, planned: 0, resolved: 0, shake: 0, flash: 0, lastDrop: -10000, missionTimer: 0, bannerUntil: 0, committed: false };
  enemies = []; bullets = []; enemyBullets = []; particles = []; texts = []; pickups = []; accumulator = 0; hudTimer = 0;
  input.keys.clear(); input.pointer = null; player = new Player();
  document.querySelectorAll('.screen').forEach(el => el.classList.add('hidden')); $('hud').classList.remove('hidden');
  $('controlHint').textContent = matchMedia('(pointer: coarse)').matches ? 'ВЕДИТЕ ПАЛЬЦЕМ ПО ЭКРАНУ · ОГОНЬ АВТОМАТИЧЕСКИЙ' : 'WASD / СТРЕЛКИ / МЫШЬ · ОГОНЬ АВТОМАТИЧЕСКИЙ';
  Director.beginWave(); updateHUD();
}
function commitRun() {
  if (run.committed) return; run.committed = true;
  Save.data.credits += run.credits;
  Missions.update('score_run', run.score); Missions.update('play_time', run.missionTimer / 60000); run.missionTimer = 0;
  if (run.mode === 'ENDLESS') { Save.data.highScore = Math.max(Save.data.highScore, run.score); Save.data.bestWave = Math.max(Save.data.bestWave, run.wave); Save.data.bestTime = Math.max(Save.data.bestTime, run.time); }
  Save.persist(true);
}
function finishRun(victory, reason) {
  if (!run.active || run.committed) return;
  const isCampaign = run.mode === 'CAMPAIGN', oldRecord = Save.data.highScore;
  run.active = false; run.paused = false; input.keys.clear(); input.pointer = null;
  if (victory && isCampaign) {
    const first = !Save.data.levelBest[run.level] && (run.level >= Save.data.campaignLevel) && !Save.data.completed;
    const bonus = first ? run.config.reward : run.config.repeatReward;
    run.credits += bonus; Missions.update('collect_money', bonus);
    Save.data.levelBest[run.level] = Math.max(Save.data.levelBest[run.level] || 0, run.score);
    Save.data.campaignLevel = Math.min(MAX_LEVEL, Math.max(Save.data.campaignLevel, run.level + 1));
    if (run.level === MAX_LEVEL) Save.data.completed = true;
    Audio.play('powerup');
  }
  commitRun(); $('hud').classList.add('hidden'); $('pauseMenu').classList.add('hidden'); $('resultScreen').classList.remove('hidden'); $('damageOverlay').style.opacity = 0;
  const coverage = Math.round(run.regularKills / Math.max(1, run.planned) * 100);
  $('resultTitle').textContent = victory ? (run.level === MAX_LEVEL ? 'ГАЛАКТИКА ВАША' : 'СЕКТОР ОЧИЩЕН') : reason === 'coverage' ? 'СЕКТОР НЕ ОЧИЩЕН' : 'ПОЛЁТ ЗАВЕРШЁН';
  $('resultTitle').style.color = victory ? '#91e6b2' : '#f2b1bc'; $('resultEmblem').textContent = victory ? '✦' : '◇';
  $('resultEyebrow').textContent = isCampaign ? `КАМПАНИЯ / СЕКТОР ${String(run.level).padStart(2, '0')}` : (run.score > oldRecord ? 'НОВЫЙ РЕКОРД' : 'ВЫЖИВАНИЕ / ОТЧЁТ');
  $('resultSub').textContent = victory ? 'Путь к следующей звёздной системе открыт.' : reason === 'coverage' ? `Уничтожено ${coverage}%. Для победы нужно 60%.` : 'Кредиты сохранены. Флот готов к новому вылету.';
  $('resScore').textContent = fmt(run.score); $('resCredits').textContent = fmt(run.credits); $('resMetricLabel').textContent = isCampaign ? 'УНИЧТОЖЕНО' : 'ВОЛНА';
  $('resMetric').textContent = isCampaign ? `${run.regularKills} / ${run.planned}` : run.wave; $('resTime').textContent = clockText(run.time);
  const nextShip = SHIPS.find(s => !Save.data.unlockedShips.includes(s.id) && s.cost <= Save.data.credits);
  $('resultTip').textContent = nextShip ? `Доступен новый корпус: ${nextShip.name}. Загляните в ангар.` : victory ? 'Системы флота усиливают все ваши корабли.' : 'Линия прицела фиксируется заранее — смените позицию.';
  $('resActionBtn').textContent = victory && run.level < MAX_LEVEL ? 'СЛЕДУЮЩИЙ СЕКТОР →' : 'ПОВТОРИТЬ ПОЛЁТ';
  const replayMode = run.mode, replayLevel = victory && run.level < MAX_LEVEL ? run.level + 1 : run.level;
  $('resActionBtn').onclick = () => { Audio.play('ui'); startRun(replayMode, replayLevel); }; renderMenu();
}
function pauseGame() {
  if (!run.active || run.paused) return; run.paused = true; accumulator = 0; input.keys.clear(); input.pointer = null; $('pauseMenu').classList.remove('hidden'); Save.persist(true);
}
function resumeGame() { if (!run.active) return; run.paused = false; lastFrame = performance.now(); accumulator = 0; $('pauseMenu').classList.add('hidden'); }
function showMenu() {
  if (run.active) { run.active = false; commitRun(); }
  run.paused = false; input.keys.clear(); input.pointer = null; document.querySelectorAll('.screen').forEach(el => el.classList.add('hidden'));
  $('hud').classList.add('hidden'); $('mainMenu').classList.remove('hidden'); $('damageOverlay').style.opacity = 0; renderMenu();
}
function openPanel(id) { document.querySelectorAll('.screen').forEach(el => el.classList.add('hidden')); $(id).classList.remove('hidden'); $(id).querySelector('.scroll-area')?.scrollTo(0, 0); }

function renderMenu() {
  $('menuCredits').textContent = fmt(Save.data.credits); $('menuLevel').textContent = String(Save.data.campaignLevel).padStart(2, '0'); $('menuRecord').textContent = fmt(Save.data.highScore);
  $('menuShipName').textContent = SHIPS[Save.data.currentShip].name; $('menuShipCode').textContent = String(Save.data.currentShip + 1).padStart(2, '0'); drawMenuShip(performance.now());
}
function drawMenuShip(time) {
  const c = $('menuShipCanvas').getContext('2d'); c.clearRect(0, 0, 500, 230); Atlas.draw(c, Save.data.currentShip, 250, 112 + Math.sin(time * .001) * 5, 200, -.12);
}
function renderSectors() {
  const names = ['ТИХАЯ ГРАНИЦА', 'ПОЯС ОБЛОМКОВ', 'ТЁМНЫЙ ФРОНТ', 'СЕРДЦЕ ПУСТОТЫ'];
  $('sectorGrid').replaceChildren();
  for (let chapter = 0; chapter < 4; chapter++) {
    const label = document.createElement('div'); label.className = 'chapter-title'; label.innerHTML = `<span>0${chapter + 1} / ${names[chapter]}</span><small>10 СЕКТОРОВ</small>`; $('sectorGrid').append(label);
    const grid = document.createElement('div'); grid.className = 'sector-grid';
    for (let i = 1; i <= 10; i++) {
      const level = chapter * 10 + i, button = document.createElement('button');
      button.className = `sector-btn ${level === selectedLevel ? 'selected' : ''} ${level < Save.data.campaignLevel || Save.data.levelBest[level] ? 'complete' : ''} ${level % 5 === 0 ? 'boss' : ''}`;
      button.disabled = level > Save.data.campaignLevel; button.setAttribute('aria-label', `Сектор ${level}${level % 5 === 0 ? ', босс' : ''}`);
      button.innerHTML = `${String(level).padStart(2, '0')}<small>${level % 5 === 0 ? 'БОСС' : level < Save.data.campaignLevel ? 'ПРОЙДЕН' : 'СЕКТОР'}</small>`;
      button.onclick = () => { selectedLevel = level; Audio.play('ui'); renderSectors(); }; grid.append(button);
    }
    $('sectorGrid').append(grid);
  }
  const config = Balance.campaign(selectedLevel), recommended = SHIPS[config.tier];
  $('sectorSummary').innerHTML = `<b>СЕКТОР ${String(selectedLevel).padStart(2, '0')} · 3 ВОЛНЫ${config.boss ? ' + БОСС' : ''}</b><br>Рекомендуемый корпус: ${recommended.name}.<br>Награда: ${fmt(selectedLevel < Save.data.campaignLevel || Save.data.levelBest[selectedLevel] ? config.repeatReward : config.reward)} ◈ + добыча. Для победы: 60% противников.`;
  $('launchSectorBtn').textContent = `В СЕКТОР ${String(selectedLevel).padStart(2, '0')} →`;
}
function drawShopShip(time) {
  const c = $('shipPreviewCanvas').getContext('2d'); c.clearRect(0, 0, 500, 280); Atlas.draw(c, shopIndex, 250, 133 + Math.sin(time * .0012) * 4, 242, -.08);
}
function renderShop() {
  const ship = Balance.stats(shopIndex, Save.data.fleetUpgrades), owned = Save.data.unlockedShips.includes(shopIndex), max = Balance.stats(9, { dmg: MAX_UPGRADE, hp: MAX_UPGRADE, spd: MAX_UPGRADE });
  $('shopCredits').textContent = fmt(Save.data.credits); $('shipNumber').textContent = `${String(shopIndex + 1).padStart(2, '0')} / 10`; $('shipName').textContent = ship.name; $('shipDesc').textContent = ship.role;
  $('shipTier').textContent = `КОРПУС ${String(shopIndex + 1).padStart(2, '0')} / ${owned ? 'В СОСТАВЕ ФЛОТА' : 'ДОСТУПЕН К ПОКУПКЕ'}`;
  $('statValDmg').textContent = `${Math.round(ship.dps)} ед/с`; $('statValArmor').textContent = `${ship.hp} HP`; $('statValSpeed').textContent = `${Math.round(ship.speed)} ед/с`;
  $('statBarDmg').style.width = `${ship.dps / max.dps * 100}%`; $('statBarArmor').style.width = `${ship.hp / max.hp * 100}%`; $('statBarSpeed').style.width = `${ship.speed / max.speed * 100}%`;
  const previous = shopIndex > 0 ? Balance.stats(shopIndex - 1, Save.data.fleetUpgrades) : null;
  $('shipComparison').textContent = previous ? `К предыдущему: урон +${Math.round((ship.dps / previous.dps - 1) * 100)}% · броня +${ship.hp - previous.hp} · скорость +${Math.round(ship.speed - previous.speed)}` : 'Базовый корпус · начало вашего флота';
  $('buyShipBtn').classList.toggle('hidden', owned); $('selectShipBtn').classList.toggle('hidden', !owned); $('shipCost').textContent = fmt(ship.cost); $('buyShipBtn').disabled = Save.data.credits < ship.cost;
  $('selectShipBtn').disabled = Save.data.currentShip === shopIndex; $('selectShipBtn').textContent = Save.data.currentShip === shopIndex ? '✓ ГОТОВ К ВЫЛЕТУ' : 'ВЫБРАТЬ КОРАБЛЬ';
  $('shipDots').replaceChildren();
  SHIPS.forEach(s => { const dot = document.createElement('button'); dot.className = `ship-dot ${s.id === shopIndex ? 'selected' : ''}`; dot.setAttribute('aria-label', s.name); dot.onclick = () => { shopIndex = s.id; renderShop(); }; $('shipDots').append(dot); });
  for (const [key, id] of [['dmg', 'Dmg'], ['hp', 'Hp'], ['spd', 'Spd']]) {
    const rank = Save.data.fleetUpgrades[key], cost = Balance.upgradeCost(rank);
    $(`${key}LvlText`).textContent = `РАНГ ${rank} / ${MAX_UPGRADE}`; $(`${key}CostText`).textContent = rank >= MAX_UPGRADE ? 'МАКСИМУМ' : `${fmt(cost)} ◈`;
    $(`upgrade${id}Btn`).disabled = rank >= MAX_UPGRADE || Save.data.credits < cost;
  }
  drawShopShip(performance.now());
}
function upgrade(type) {
  const rank = Save.data.fleetUpgrades[type], cost = Balance.upgradeCost(rank);
  if (rank >= MAX_UPGRADE || Save.data.credits < cost) return;
  Save.data.credits -= cost; Save.data.fleetUpgrades[type]++; sessionChanged = true; Save.persist(true); Audio.play('powerup'); renderShop();
}
function renderModules() {
  $('moduleGuide').replaceChildren();
  for (const module of Object.values(MODULES)) {
    const row = document.createElement('div'); row.className = 'module-row'; row.innerHTML = `<canvas width="80" height="80"></canvas><div><b style="color:${module.color}">${module.name}</b><p>${module.desc}</p></div>`;
    Atlas.draw(row.querySelector('canvas').getContext('2d'), module.sprite, 40, 40, 80); $('moduleGuide').append(row);
  }
}
function updateHUD() {
  if (!run.active) return;
  $('scoreDisplay').textContent = fmt(run.score); $('gameCredits').textContent = fmt(run.credits);
  $('runLabel').textContent = run.mode === 'CAMPAIGN' ? `СЕКТОР ${String(run.level).padStart(2, '0')}` : clockText(run.time);
  $('waveLabel').textContent = run.phase === 'rest' ? `ПЕРЕДЫШКА · ${Math.ceil(run.restTimer / 1000)}` : `ВОЛНА ${run.wave}${run.mode === 'CAMPAIGN' ? ' / 3' : ''}`;
  const wavePct = clamp((run.resolved - (run.waveResolvedStart || 0)) / Math.max(1, run.waveTotal), 0, 1);
  $('levelProgressBar').style.width = `${run.mode === 'CAMPAIGN' ? Math.min(100, ((run.wave - 1 + wavePct) / 3) * 100) : wavePct * 100}%`;
  $('healthText').textContent = `${Math.ceil(player.hp)} / ${player.maxHp}`; $('healthBar').style.width = `${Math.max(0, player.hp / player.maxHp * 100)}%`; $('healthBar').style.background = player.hp < player.maxHp * .3 ? '#ff738c' : '#75e9f5';
  $('waveBanner').style.opacity = run.time < run.bannerUntil ? 1 : 0; $('controlHint').style.opacity = run.time < 7500 ? 1 : 0;
  const boss = enemies.find(e => e.type === 'boss' && e.active); $('bossHUD').classList.toggle('hidden', !boss); if (boss) $('bossHealthBar').style.width = `${Math.max(0, boss.hp / boss.maxHp * 100)}%`;
  $('boostHUD').replaceChildren();
  for (const [type, time] of Object.entries(player.boosts)) if (time > 0) {
    const chip = document.createElement('div'); chip.className = 'boost-chip'; chip.innerHTML = `<canvas width="50" height="50"></canvas><b>${MODULES[type].name} ${Math.ceil(time / 1000)}с</b>`; Atlas.draw(chip.querySelector('canvas').getContext('2d'), MODULES[type].sprite, 25, 25, 50); $('boostHUD').append(chip);
  }
}
function drawBackground(elapsed) {
  ctx.fillStyle = '#050c18'; ctx.fillRect(0, 0, W, H);
  const nebula = ctx.createRadialGradient(80, 260, 0, 90, 400, 690); nebula.addColorStop(0, '#17314c55'); nebula.addColorStop(.6, '#10213a22'); nebula.addColorStop(1, '#050c1800'); ctx.fillStyle = nebula; ctx.fillRect(0, 0, W, H);
  for (const star of stars) { if (!run.paused) star.y += elapsed / 1000 * (run.active ? 32 : 9) * star.z; if (star.y > H) star.y = 0; ctx.globalAlpha = star.z * .7; ctx.fillStyle = '#aacfe7'; ctx.fillRect(star.x, star.y, star.r, star.r * (run.active ? 1.7 : 1)); } ctx.globalAlpha = 1;
}
function render(elapsed, now) {
  drawBackground(elapsed);
  if (run.active) {
    ctx.save(); if (run.shake > .1) ctx.translate(Math.sin(now * .13) * run.shake, Math.cos(now * .11) * run.shake * .6);
    for (const e of enemies) e.draw(ctx);
    for (const p of pickups) { const size = 45 + Math.sin(p.age * .005) * 2; Atlas.draw(ctx, MODULES[p.type].sprite, p.x, p.y, size); }
    for (const b of bullets) b.draw(ctx); for (const b of enemyBullets) b.draw(ctx); player.draw(ctx);
    for (const p of particles) { ctx.globalAlpha = clamp(p.life * 2, 0, 1); ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, 3, 3); } ctx.globalAlpha = 1;
    ctx.textAlign = 'center'; ctx.font = '600 17px "Exo 2", sans-serif';
    for (const t of texts) { ctx.globalAlpha = Math.min(1, t.life); ctx.fillStyle = t.color; ctx.fillText(t.text, t.x, t.y); } ctx.restore();
    $('damageOverlay').style.opacity = run.flash > 0 ? .8 : 0;
  }
  hudTimer += elapsed; previewTimer += elapsed;
  if (hudTimer > 100) { updateHUD(); hudTimer = 0; }
  if (previewTimer > 33) { if (!$('mainMenu').classList.contains('hidden')) drawMenuShip(now); if (!$('shopMenu').classList.contains('hidden')) drawShopShip(now); previewTimer = 0; }
}
function loop(now) { const elapsed = lastFrame ? Math.min(250, now - lastFrame) : 0; lastFrame = now; advance(elapsed); render(elapsed, now); requestAnimationFrame(loop); }

function onClick(id, callback) { $(id).onclick = () => { Audio.unlock(); Audio.play('ui'); callback(); }; }
onClick('campaignBtn', () => { selectedLevel = Save.data.campaignLevel; renderSectors(); openPanel('sectorMenu'); });
onClick('launchSectorBtn', () => startRun('CAMPAIGN', selectedLevel)); onClick('endlessBtn', () => startRun('ENDLESS'));
const openHangar = () => { shopIndex = Save.data.currentShip; renderShop(); openPanel('shopMenu'); };
onClick('shopBtn', openHangar); onClick('resHangarBtn', openHangar);
onClick('prevShip', () => { shopIndex = (shopIndex + SHIPS.length - 1) % SHIPS.length; renderShop(); });
onClick('nextShip', () => { shopIndex = (shopIndex + 1) % SHIPS.length; renderShop(); });
onClick('selectShipBtn', () => { if (!Save.data.unlockedShips.includes(shopIndex)) return; Save.data.currentShip = shopIndex; sessionChanged = true; Save.persist(true); renderShop(); });
onClick('buyShipBtn', () => { const ship = SHIPS[shopIndex]; if (Save.data.unlockedShips.includes(ship.id) || Save.data.credits < ship.cost) return; Save.data.credits -= ship.cost; Save.data.unlockedShips.push(ship.id); Save.data.currentShip = ship.id; sessionChanged = true; Save.persist(true); Audio.play('powerup'); renderShop(); });
onClick('upgradeDmgBtn', () => upgrade('dmg')); onClick('upgradeHpBtn', () => upgrade('hp')); onClick('upgradeSpdBtn', () => upgrade('spd'));
onClick('pauseBtn', pauseGame); onClick('resumeBtn', resumeGame); onClick('quitBtn', showMenu); onClick('resMenuBtn', showMenu);
onClick('missionsBtn', () => { Missions.render(); openPanel('missionsModal'); }); onClick('claimDailyBtn', () => Daily.claim());
onClick('settingsBtn', () => openPanel('settingsModal')); onClick('rulesBtn', () => { renderModules(); openPanel('infoModal'); });
document.querySelectorAll('[data-close]').forEach(button => button.onclick = () => { Audio.play('ui'); showMenu(); });
for (const [key, id] of [['sfx', 'sfxToggle'], ['music', 'musicToggle'], ['shake', 'shakeToggle']]) { $(id).checked = settings[key]; $(id).onchange = e => { settings[key] = e.target.checked; localSet('voidstorm_settings', JSON.stringify(settings)); Audio.music(); }; }

canvas.addEventListener('pointerdown', e => {
  if (!run.active || run.paused) return; e.preventDefault(); Audio.unlock(); input.pointer = e.pointerId; input.lastX = e.clientX; input.lastY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
  if (e.pointerType === 'mouse') pointerMove(e);
});
function pointerMove(e) {
  if (!run.active || run.paused) return;
  const rect = canvas.getBoundingClientRect();
  if (e.pointerType === 'mouse') { player.targetX = (e.clientX - rect.left) * W / rect.width; player.targetY = (e.clientY - rect.top) * H / rect.height; }
  else if (input.pointer === e.pointerId) { player.targetX += (e.clientX - input.lastX) * W / rect.width; player.targetY += (e.clientY - input.lastY) * H / rect.height; }
  input.lastX = e.clientX; input.lastY = e.clientY;
}
canvas.addEventListener('pointermove', pointerMove);
const releasePointer = e => { if (input.pointer === e.pointerId) input.pointer = null; };
canvas.addEventListener('pointerup', releasePointer); canvas.addEventListener('pointercancel', releasePointer); canvas.addEventListener('lostpointercapture', releasePointer);
window.addEventListener('keydown', e => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code) && run.active) { e.preventDefault(); input.keys.add(e.code); }
  if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat) { if (run.active) { e.preventDefault(); run.paused ? resumeGame() : pauseGame(); } else if ($('dailyModal').classList.contains('hidden')) showMenu(); }
});
window.addEventListener('keyup', e => input.keys.delete(e.code));
window.addEventListener('blur', pauseGame);
document.addEventListener('visibilitychange', () => { if (document.hidden) { pauseGame(); Save.persist(true); } Audio.music(); });
window.addEventListener('pagehide', () => { if (run.active) commitRun(); Save.persist(true); });

Missions.check(); renderMenu(); renderShop(); renderModules(); Atlas.init(); Daily.check(); VK.init(); requestAnimationFrame(loop);
// Read-only diagnostics and explicit test hooks for the local regression harness.
window.Voidstorm = { get state() { return run; }, get player() { return player; }, get enemies() { return enemies; }, get bullets() { return bullets; }, get enemyBullets() { return enemyBullets; }, get save() { return Save.data; }, get atlasReady() { return Atlas.ready; } };
