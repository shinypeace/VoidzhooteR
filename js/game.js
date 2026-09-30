/* VOIDSTORM 4 — fixed-step simulation, bounded encounters, sprite atlas renderer. */
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
  music() { const el = $('bgMusic'); el.volume = .23; if (settings.music && this.unlocked && !document.hidden && !VKAds.busy) el.play().catch(() => {}); else el.pause(); },
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
    // Contract counters change during combat. Flush them at a break, never block a frame on disk I/O.
    if (!immediate && run.active && !run.paused) return;
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
if (!localGet('voidstorm_save_before_v4') && localGet('voidstorm_save')) localSet('voidstorm_save_before_v4', localGet('voidstorm_save'));
const Atlas = {
  ready: false, error: false, cache: new Map(), sources: [],
  draw(c, index, x, y, size, rotation = 0) {
    if (!this.ready) return;
    size = Math.round(size);
    const key = index + ':' + size + ':' + rotation;
    let sprite = this.cache.get(key);
    if (!sprite) {
      const sourceId = index >= 300 ? 3 : index >= 200 ? 2 : index >= 100 ? 1 : 0, source = this.sources[sourceId];
      const frame = ATLAS_FRAMES[sourceId][index % 100], [sx, sy, sw, sh] = frame;
      const scale = size * .92 / Math.max(sw, sh), dw = sw * scale, dh = sh * scale;
      sprite = document.createElement('canvas'); sprite.width = sprite.height = Math.ceil(size * (rotation % Math.PI ? 1.22 : 1));
      const sc = sprite.getContext('2d'); sc.translate(sprite.width / 2, sprite.height / 2); sc.rotate(rotation + (index === 302 ? Math.PI : 0));
      sc.drawImage(source.image, sx, sy, sw, sh, -dw / 2, -dh / 2, dw, dh);
      this.cache.set(key, sprite);
    }
    c.drawImage(sprite, Math.round(x - sprite.width / 2), Math.round(y - sprite.height / 2));
  },
  init() {
    let loaded = 0;
    this.sources = [{ file: 'voidstorm-atlas.webp', cols: 5, rows: 5 }, { file: 'expansion-atlas.webp', cols: 4, rows: 4 }, { file: 'projectile-atlas.webp', cols: 4, rows: 4 }, { file: 'reinforcements-atlas.webp', cols: 2, rows: 4 }];
    for (const source of this.sources) {
      source.image = new Image();
      source.image.onload = () => {
        if (++loaded !== 4) return;
        this.ready = true;
        // Prewarm every combat sprite once; no sprite rasterization during a dense wave.
        const scratch = document.createElement('canvas').getContext('2d');
        for (const e of Object.values(ENEMIES)) this.draw(scratch, e.sprite, 0, 0, e.radius * 2.7, Math.PI);
        for (const boss of Balance.BOSSES) this.draw(scratch, boss.sprite, 0, 0, boss.size, Math.PI);
        for (const ship of SHIPS) this.draw(scratch, ship.id, 0, 0, 88);
        for (const module of Object.values(MODULES)) this.draw(scratch, module.sprite, 0, 0, 45);
        Object.keys(ShotArt.frames).forEach(style => ShotArt.get(style));
        $('assetStatus').textContent = 'СИСТЕМЫ ГОТОВЫ'; renderMenu(); renderShop(); renderModules(); initBoostHUD();
      };
      source.image.onerror = () => { this.error = true; $('assetStatus').textContent = 'ОШИБКА ЗАГРУЗКИ'; toast('Не загружен атлас ' + source.file + '. Перезагрузите игру.'); };
      source.image.src = 'assets/' + source.file;
    }
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
      el.innerHTML = `<h3>${this.names[m.id]}</h3><div class="mission-meta"><span>${Math.floor(m.current)} / ${m.target}${m.id === 'play_time' ? ' мин' : ''}</span><b class="gold">+${fmt(m.reward)} CR</b></div><div class="mission-progress"><i style="width:${Math.min(100, m.current / m.target * 100)}%"></i></div>`;
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

let sessionChanged = false, shopIndex = Save.data.currentShip, selectedLevel = Save.data.campaignLevel, selectedUpgrade = 'dmg';
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
    this.hp = this.stats.hp; this.maxHp = this.hp; this.radius = 17; this.hitHeight = 26; this.iframe = 1800; this.shotTimer = 0;
    this.boosts = { overdrive: 0, multishot: 0, shield: 0 };
  }
  update(dt) {
    const s = dt / 1000;
    let kx = Number(input.keys.has('ArrowRight') || input.keys.has('KeyD')) - Number(input.keys.has('ArrowLeft') || input.keys.has('KeyA'));
    let ky = Number(input.keys.has('ArrowDown') || input.keys.has('KeyS')) - Number(input.keys.has('ArrowUp') || input.keys.has('KeyW'));
    if (kx || ky) { const length = Math.hypot(kx, ky); this.targetX = this.x + kx / length * this.stats.speed * s; this.targetY = this.y + ky / length * this.stats.speed * s; }
    this.targetX = clamp(this.targetX, 28, W - 28); this.targetY = clamp(this.targetY, 100, H - 42);
    // Touch/mouse positioning has no speed cap or accumulated velocity. Settle in ~60ms.
    const response = kx || ky ? 1 : 1 - Math.exp(-dt / (18));
    this.x += (this.targetX - this.x) * response; this.y += (this.targetY - this.y) * response;
    this.iframe = Math.max(0, this.iframe - dt);
    if (run.phase === 'rest') return;
    for (const type in this.boosts) this.boosts[type] = Math.max(0, this.boosts[type] - dt);
    this.shotTimer -= dt;
    if (this.shotTimer <= 0) { this.shoot(); this.shotTimer += this.stats.interval / (this.boosts.overdrive > 0 ? 1.6 : 1); }
  }
  shoot() {
    if (bullets.length > 160) return;
    Audio.play('shoot');
    const s = this.stats, damage = s.dps * s.interval / 1000;
    const patterns = { single: [0], double: [-10, 10], spread: [-16, 0, 16], sniper: [0], rapid: [0], homing: [-8, 8], omega: [-12, 12], lance: [-16, 0, 16], storm: [-18, 0, 18], nova: [-18, -11, -4, 4, 11, 18] };
    const offsets = patterns[s.weapon], guided = ['homing', 'omega', 'storm', 'nova'].includes(s.weapon);
    offsets.forEach(off => bullets.push(new Bullet(this.x + off, this.y - 29, 0, ['sniper', 'rapid'].includes(s.weapon) ? -1050 : -800, damage * (guided ? .75 : 1) / offsets.length, s.color,
      { pierce: ['sniper', 'lance'].includes(s.weapon) ? 2 : 1, width: s.weapon === 'sniper' ? 7 : 4 })));
    if (guided) for (const side of [-1, 1]) bullets.push(new Bullet(this.x + side * 21, this.y - 21, side * 35, -740, damage * .125, s.color, { homing: true }));
    if (this.boosts.multishot > 0) for (const side of [-1, 1]) bullets.push(new Bullet(this.x + side * 25, this.y - 20, side * 90, -760, damage * .25, '#85ecff'));
  }

  hit(damage) {
    if (!run.active || this.iframe > 0 || this.boosts.shield > 0) return;
    this.hp = Math.max(0, this.hp - damage); this.iframe = 650; run.shake = settings.shake ? 9 : 0; run.flash = 150; Audio.play('hit');
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
    c.globalAlpha *= .65; c.fillStyle = '#5bccff'; c.fillRect(this.x - 4, this.y + 23, 8, engine); c.fillStyle = '#d2fbff'; c.fillRect(this.x - 2, this.y + 23, 4, engine * .55); c.globalAlpha = 1;
    Atlas.draw(c, this.stats.id, this.x, this.y, 88); c.restore();
    if (this.boosts.shield > 0) { c.strokeStyle = '#8fc3ff99'; c.lineWidth = 2; c.beginPath(); c.arc(this.x, this.y, 44 + Math.sin(run.time * .004) * 2, 0, Math.PI * 2); c.stroke(); }
    c.fillStyle = '#d8ffff'; c.beginPath(); c.arc(this.x, this.y, 3, 0, Math.PI * 2); c.fill();
  }
}
const ShotArt = {
  sprites: new Map(),
  frames: { red: 0, needle: 1, laser: 2, diamond: 3, orb: 4, rail: 5, plasma: 6, bomb: 7, ring: 8, fork: 9, arc: 10, pulse: 11, mine: 12, toxic: 13, shard: 14, player: 15 },
  get(style) {
    if (this.sprites.has(style)) return this.sprites.get(style);
    const cv = document.createElement('canvas'); cv.width = cv.height = 42;
    if (!Atlas.ready) return cv;
    Atlas.draw(cv.getContext('2d'), 200 + (this.frames[style] ?? 0), 21, 21, 42);
    this.sprites.set(style, cv); return cv;
  }
};
class Bullet {
  constructor(x, y, vx, vy, damage, color, options = {}) { Object.assign(this, { x, y, vx, vy, damage, color, active: true, life: 0, width: 4, homing: false, pierce: 1, enemy: false, style: 'red', split: false }, options); this.hits = this.enemy ? null : new Set(); this.prevX = x; this.prevY = y; this.angle = Math.atan2(vy, vx) + Math.PI / 2; }
  update(dt) {
    const s = dt / 1000; this.prevX = this.x; this.prevY = this.y; this.life += dt;
    if (this.homing && this.life < 1500) {
      let target = null, nearest = 520;
      for (const e of enemies) if (e.active && e.y > 0 && e.y < this.y - 15 && !this.hits.has(e)) {
        const dx = e.x - this.x, forward = this.y - e.y, distance = Math.hypot(dx, forward);
        if (Math.abs(dx) < forward * .30 && distance < nearest) { target = e; nearest = distance; }
      }
      if (target) {
        const current = Math.atan2(this.vx, -this.vy), desired = clamp(Math.atan2(target.x - this.x, this.y - target.y), -.30, .30);
        const angle = current + clamp(desired - current, -s * .85, s * .85);
        this.vx = Math.sin(angle) * 740; this.vy = -Math.cos(angle) * 740; this.angle = angle;
      }
    }
    this.x += this.vx * s; this.y += this.vy * s;
    if (this.split && this.life > (this.style === 'mine' ? 2300 : 1450)) {
      this.active = false;
      for (let i = 0; i < 6; i++) if (enemyBullets.length < run.config.bulletCap) {
        const a = i * Math.PI / 3 + .3;
        enemyBullets.push(new Bullet(this.x, this.y, Math.cos(a) * 175, Math.sin(a) * 175, this.damage * .7, '#ffba74', { enemy: true, style: 'needle', width: 4 }));
      }
    }
    if (this.x < -60 || this.x > W + 60 || this.y < -80 || this.y > H + 80 || this.life > 8500) this.active = false;
  }
  draw(c) {
    c.save(); c.translate(this.x, this.y); c.rotate(this.angle);
    c.fillStyle = this.color;
    if (this.enemy) c.drawImage(ShotArt.get(this.style), -21, -21);
    else c.drawImage(ShotArt.get(this.homing ? 'plasma' : 'player'), this.pierce > 1 ? -9 : -7, -18, this.pierce > 1 ? 18 : 14, this.pierce > 1 ? 44 : 32); c.restore();
  }
}
class Enemy {
  constructor(type, config, x, escort = false) {
    this.type = type; this.def = ENEMIES[type]; this.active = true; this.escort = escort; this.age = 0;
    this.x = x ?? randomBetween(48, W - 48); this.originX = this.x; this.y = -65;
    this.radius = this.def.radius; this.maxHp = this.def.hp * config.scale * (escort ? .65 : 1); this.hp = this.maxHp;
    this.speed = this.def.speed * config.speedMult; this.config = config; this.phase = Math.random() * 6.28;
    this.shotTimer = this.def.rate * config.fireRate * randomBetween(.12, .32);
    this.hitFlash = 0; this.shotCount = 0; this.bossPhase = 0; this.summonTimer = 4200;
    if (type === 'boss') { this.boss = Balance.BOSSES[config.bossKind]; this.def = { ...this.def, ...this.boss }; this.radius = this.boss.size * .32; this.x = W / 2; this.y = -110; this.maxHp = config.bossHp; this.hp = this.maxHp; this.shotTimer = 950; }
  }
  update(dt) {
    const s = dt / 1000; this.age += dt; this.hitFlash = Math.max(0, this.hitFlash - dt);
    if (this.type === 'boss') {
      const phase = this.hp > this.maxHp * .67 ? 0 : this.hp > this.maxHp * .33 ? 1 : 2;
      if (phase !== this.bossPhase) { this.bossPhase = phase; this.shotTimer = 1100; banner(`ФАЗА ${phase + 1}`, ['','','Орудия работают на пределе'][phase] || 'Обнаружены подкрепления', 1500); }
      const kind = this.config.bossKind, time = this.age / 1000;
      let targetX = W / 2 + Math.sin(time * .55) * (this.config.level <= 10 ? 110 : 155);
      let targetY = 165 + Math.sin(time * 1.1) * 34, motion = 175;
      if (kind === 1 || kind === 5) { targetX = W / 2 + Math.sin(time * .55) * 120; targetY = 155; }
      if (kind === 2) { targetX = Math.floor(time / 3.6) % 2 ? 105 : 495; targetY = 185 + (phase === 2 ? 100 : 0); motion = 360; }
      if (kind === 3) { targetX = W / 2 + Math.sin(time * 1.05) * 135; targetY = 160 + Math.cos(time * .7) * 50; }
      if (kind === 4) { targetX = W / 2 + Math.sin(time * .45) * 145; }
      if (kind === 6) { targetX = W / 2 + Math.sin(time * .65) * 180; this.armored = time % 7 < 3; }
      if (kind === 7) { targetX = W / 2 + Math.cos(time * .8) * 110; targetY = 185 + Math.sin(time * .8) * 75; }
      if (kind === 8) { targetX = W / 2 + Math.sin(time * .35) * 100; targetY = 155 + (phase === 2 ? 100 : 0); this.armored = time % 8 < 4; }
      if (kind === 9) { targetX = W / 2 + Math.sin(time * (.6 + phase * .25)) * 190; targetY = 155 + phase * 40; }
      this.x += clamp(targetX - this.x, -motion * s, motion * s);
      this.y += clamp(targetY - this.y, -130 * s, 130 * s);
      if (this.y > 100) {
        this.summonTimer -= dt;
        if (this.summonTimer <= 0) { this.summon(); this.summonTimer = kind === 1 ? 6200 : kind === 5 ? 7000 : 12000; }
      }
    } else {
      const holding = ['sniper', 'artillery', 'oracle'].includes(this.type) && this.y >= 210 && this.age < 5400;
      if (!holding) this.y += this.speed * s;
      if (this.type === 'drone' || this.type === 'guardian') this.x = clamp(this.originX + Math.sin(this.age * .0016 + this.phase) * 38, 35, W - 35);
      if (this.type === 'hunter' && this.y < H - 300) this.x += clamp(player.x - this.x, -110, 110) * s * .8;
      if (this.type === 'scout') this.x = clamp(this.originX + Math.sin(this.age * .002 + this.phase) * 55, 30, W - 30);
      if (this.type === 'aegis') this.armored = this.age % 5000 < 2300;
      if (['corsair', 'saw', 'mirage'].includes(this.type)) this.x = clamp(this.originX + Math.sin(this.age * .0025 + this.phase) * 115, 35, W - 35);
      if (this.type === 'weaver' || this.type === 'wraith') this.x = clamp(this.originX + Math.sin(this.age * (this.type === 'wraith' ? .003 : .002)) * 100, 38, W - 38);
      if (this.type === 'lancer' && this.age < 4000 && this.y > 230) this.y -= this.speed * s;
      if (this.type === 'striker') this.x = clamp(this.originX + Math.sin(this.age * .0014) * 70, 35, W - 35);
      if (this.type === 'elite') this.x = clamp(this.originX + Math.sin(this.age * .0018) * 68, 45, W - 45);
    }
    if (this.y > 60 && this.y < Math.min(H - 150, player.y - 65)) {
      this.shotTimer -= dt;
      if (this.shotTimer <= 0) { this.shoot(); this.shotTimer += this.def.rate * this.config.fireRate * (this.type === 'boss' ? 1 - this.bossPhase * .1 : 1); }
    }
    if (this.type !== 'boss' && (this.y > H + 90 || this.age > 18500)) {
      this.active = false; if (!this.escort) { run.escaped++; run.resolved++; }
    }
  }
  emit(angle, speed, style = this.def.shot, xOff = 0) {
    if (enemyBullets.length >= this.config.bulletCap) return;
    const widths = { orb: 7, ring: 7, bomb: 8, rail: 4, diamond: 5, mine: 8, pulse: 7, toxic: 6, arc: 6, fork: 5 };
    speed *= this.config.bulletSpeed;
    enemyBullets.push(new Bullet(this.x + xOff, this.y + this.radius * .55, Math.cos(angle) * speed, Math.sin(angle) * speed, this.config.damage, this.def.color,
      { enemy: true, style, width: widths[style] || 4, split: style === 'bomb' || style === 'mine' }));
    run.shotsFired++;
  }
  fan(count, spacing, angle, speed, style) { for (let i = 0; i < count; i++) this.emit(angle + (i - (count - 1) / 2) * spacing, speed, style); }
  shoot() {
    if (!this.active || !run.active) return;
    this.shotCount++;
    const down = Math.PI / 2, aim = down + Math.sin(this.shotCount * 1.7 + this.phase) * .30;
    switch (this.type) {
      case 'drone': this.emit(down, 230); break;
      case 'scout': this.emit(down - .12, 305, 'needle', -7); this.emit(down + .12, 305, 'needle', 7); break;
      case 'fighter': this.emit(aim, 285, 'laser', -15); this.emit(aim, 285, 'laser', 15); break;
      case 'hunter': this.fan(3, .18, aim, 265, 'diamond'); break;
      case 'tank': this.fan(5, .22, down + Math.sin(this.shotCount) * .15, 190, 'orb'); break;
      case 'sniper': this.emit(aim, 410, 'rail', -8); this.emit(aim, 375, 'rail', 8); break;
      case 'elite': this.fan(5, .16, aim, 255, 'plasma'); break;
      case 'bomber': this.emit(down - .24, 115, 'bomb', -17); this.emit(down + .24, 115, 'bomb', 17); break;
      case 'guardian': this.fan(7, .3, down + (this.shotCount % 2 ? .12 : -.12), 195, 'ring'); break;
      case 'striker': this.emit(down - .14, 300, 'fork', -18); this.emit(down + .14, 300, 'fork', 18); break;
      case 'weaver': this.fan(3, .30, down + Math.sin(this.shotCount) * .32, 225, 'arc'); break;
      case 'lancer': this.emit(down - .08, 380, 'shard', -22); this.emit(down + .08, 380, 'shard', 22); break;
      case 'bulwark': this.fan(5, .24, down + (this.shotCount % 2 ? .12 : -.12), 195, 'pulse'); break;
      case 'minelayer': this.emit(down - .4, 90, 'mine', -24); this.emit(down + .4, 90, 'mine', 24); break;
      case 'wraith': this.fan(3, .2, down, 290, 'toxic'); break;
      case 'corsair': for (const side of [-1, 1]) this.emit(down + side * .25, 285, 'fork', side * 24); break;
      case 'pulsar': this.fan(this.shotCount % 2 ? 3 : 5, .28, down, 225, 'pulse'); break;
      case 'saw': this.emit(down - .4, 260, 'arc', -20); this.emit(down + .4, 260, 'arc', 20); break;
      case 'artillery': if (this.shotCount % 2) this.fan(3, .3, down, 175, 'orb'); else this.emit(down, 105, 'bomb'); break;
      case 'courier': this.fan(3, .25, down, 300, 'needle'); break;
      case 'aegis': this.fan(this.armored ? 3 : 5, .26, down, 205, 'ring'); break;
      case 'mirage': for (const offset of [-30, 0, 30]) this.emit(down + (this.shotCount % 2 ? .2 : -.2), 280, 'plasma', offset); break;
      case 'oracle': if (this.shotCount % 2) this.fan(3, .5, down, 95, 'mine'); else this.fan(5, .25, down, 205, 'diamond'); break;
      case 'boss': this.bossShoot(); break;
    }
  }
  bossShoot() {
    const p = this.bossPhase, n = this.shotCount, down = Math.PI / 2;
    switch (this.config.bossKind) {
      case 0:
        if (n % 3) this.fan(5 + p * 2, .22, down + Math.sin(n) * .28, 205, 'orb');
        else for (const offset of [-60, 0, 60]) this.emit(down, 315, 'fork', offset);
        break;
      case 1:
        for (const side of [-1, 1]) { this.emit(down + side * .3, 110, 'bomb', side * 48); this.emit(down, 240, 'laser', side * 48); }
        break;
      case 2:
        if (this.age % 3600 < 1500) break; // Dash first, then expose guns during the stop.
        this.fan(5 + p * 2, .23, down + (this.x > 300 ? .45 : -.45), 250, 'arc');
        break;
      case 3:
        if (n % 3 === 0) break; // Paired batteries recharge together, opening a crossing window.
        for (let i = -2; i <= 2; i++) this.emit(down + i * .20 + (n % 2 ? -.14 : .14), 245, n % 2 ? 'shard' : 'rail', n % 2 ? -50 : 50);
        break;
      case 4:
        if (n % 8 >= 4) break;
        for (let i = -1; i <= 1; i++) this.emit(down + i * .2, 260, 'laser', [-60, -20, 20, 60][n % 4]);
        break;
      case 5:
        if (n % 2) { this.emit(down - .35, 95, 'mine', -48); this.emit(down + .35, 95, 'mine', 48); }
        else this.fan(7 + p * 2, .28, down + Math.sin(n) * .2, 180, 'toxic');
        break;
      case 6:
        if (this.armored) this.fan(3, .35, down, 215, 'diamond');
        else this.fan(7 + p * 2, .24, down + (n % 2 ? .12 : -.12), 230, 'shard');
        break;
      case 7:
        for (let i = 0; i < 3; i++) this.emit(n * .27 + i * Math.PI * 2 / 3, 195 + p * 15, 'plasma');
        break;
      case 8:
        if (this.armored) { for (const side of [-1, 1]) for (let i = 0; i < 3; i++) this.emit(down + side * (.08 + i * .20), 245, 'pulse', side * 58); }
        else if (n % 2) this.fan(5, .25, down, 190, 'orb');
        break;
      case 9:
        if (p === 0) this.fan(7, .24, down + Math.sin(n) * .25, 235, 'fork');
        if (p === 1) for (let i = 0; i < 8; i++) this.emit(n * .31 + i * Math.PI / 4, 205, 'ring');
        if (p === 2) { this.fan(5, .29, down, 260, 'diamond'); if (n % 3 === 0) { this.emit(down - .4, 110, 'bomb', -48); this.emit(down + .4, 110, 'bomb', 48); } }
        break;
    }
  }

  summon() {
    const cap = this.bossPhase === 0 ? 2 : 3;
    let count = enemies.filter(e => e.active && e.escort).length;
    for (const x of [75, W - 75, W / 2]) {
      if (count >= cap) break;
      const kind = this.config.bossKind === 5 ? 'drone' : this.config.bossKind === 1 ? 'hunter' : this.bossPhase === 2 ? 'fighter' : 'scout';
      const type = ENEMIES[kind].unlock <= this.config.level ? kind : 'drone';
      if (!Balance.canSpawn(type, enemies, this.config)) continue;
      enemies.push(new Enemy(type, this.config, x, true)); count++;
    }
  }
  hit(damage) {
    if (!this.active) return;
    this.hp -= damage * (this.armored ? .45 : 1); this.hitFlash = 80;
    if (this.hp > 0) return;
    this.active = false; run.kills++; if (!this.escort) run.resolved++;
    if (this.type !== 'boss' && !this.escort) run.regularKills++;
    const reward = this.escort ? 0 : this.def.credits;
    run.score += this.escort ? Math.ceil(this.def.score * .5) : this.def.score; run.credits += reward;
    Missions.update('kill_' + this.type, 1); Missions.update('collect_money', reward);
    explosion(this.x, this.y, this.def.color, this.type === 'boss' ? 40 : 11); Audio.play('explode');
    if (this.type === 'boss') {
      run.bossKilled = true; enemyBullets.length = 0;
      for (const e of enemies) if (e.escort) { e.active = false; explosion(e.x, e.y, e.def.color, 8); }
      dropModule(this.x, this.y, 'shield');
    } else if (!this.escort && Math.random() < .10 && run.time - run.lastDrop > 3500) dropModule(this.x, this.y);
  }
  draw(c) {
    Atlas.draw(c, this.def.sprite, this.x, this.y, this.type === 'boss' ? this.boss.size : this.radius * 2.7, Math.PI);
    if (this.armored) { c.strokeStyle = '#8bcfff99'; c.lineWidth = 3; c.beginPath(); c.arc(this.x, this.y, this.radius + 8, 0, Math.PI * 2); c.stroke(); }
    if (this.hitFlash > 0) { c.fillStyle = '#ffffff99'; c.fillRect(this.x - 3, this.y - 3, 6, 6); }
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
    if (run.pendingSupply) { dropModule(player.x < W / 2 ? W - 110 : 110, -32, run.pendingSupply); run.pendingSupply = null; }
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
      // Give dense salvoes time to pass before adding more guns to the field.
      const pressure = enemyBullets.reduce((n, b) => n + Number(b.active && b.y > H * .38 && b.y < H && b.vy > 0), 0);
      if (pressure > Math.max(18, c.bulletCap * .30)) { run.spawnTimer = 350; return; }
      // Find an affordable enemy without blocking the queue on a heavy unit.
      const index = run.queue.findIndex(type => Balance.canSpawn(type, enemies, c));
      if (index >= 0) { const type = run.queue.splice(index, 1)[0]; enemies.push(new Enemy(type, c)); run.spawnTimer = c.interval; }
      else run.spawnTimer = 180;
    }
    const alive = enemies.some(e => e.active);
    if (!run.queue.length && !alive) {
      if (run.bossPending && !run.bossSpawned) {
        run.bossSpawned = true; run.phase = 'boss'; enemies.push(new Enemy('boss', c)); enemyBullets = [];
        banner(Balance.BOSSES[c.bossKind].name, Balance.BOSSES[c.bossKind].mechanic, 3200); return;
      }
      if (run.bossPending && !run.bossKilled) return;
      enemyBullets = [];
      if (run.mode === 'CAMPAIGN' && run.wave >= c.waves) { finishRun(run.regularKills / Math.max(1, run.planned) >= .6, 'coverage'); return; }
      if (run.mode === 'ENDLESS') { const bonus = 60 + Math.min(30, run.wave) * 15; run.credits += bonus; Missions.update('collect_money', bonus); }
      run.wave++; run.phase = 'rest'; run.restTimer = 4300;
      player.hp = Math.min(player.maxHp, player.hp + player.maxHp * .05); player.iframe = Math.max(player.iframe, 1500);
      run.pendingSupply = run.wave % 3 === 0 ? 'health' : run.wave % 2 === 0 ? 'overdrive' : 'multishot';
      bankIncome(); Save.persist(true);
      banner('ПЕРЕДЫШКА', 'Броня +5% · Снабжение прибудет с новой волной', 3800);
    }
  }
};
// Swept collision prevents fast projectiles from skipping targets between frames.
function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, d = dx * dx + dy * dy;
  const t = d ? clamp(((px - ax) * dx + (py - ay) * dy) / d, 0, 1) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
function hitsPlayer(b) {
  // Swept ellipse of the central hull. Wings and decorative projectile glow are excluded.
  const rx = player.radius + b.width, ry = player.hitHeight + b.width;
  return segmentDistance(0, 0, (b.prevX - player.x) / rx, (b.prevY - player.y) / ry, (b.x - player.x) / rx, (b.y - player.y) / ry) < 1;
}
function compactActive(list) { let n = 0; for (let i = 0; i < list.length; i++) if (list[i].active) list[n++] = list[i]; list.length = n; }
function compactAlive(list) { let n = 0; for (let i = 0; i < list.length; i++) if (list[i].life > 0) list[n++] = list[i]; list.length = n; }
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
  for (const b of enemyBullets) if (b.active && hitsPlayer(b)) { b.active = false; player.hit(b.damage); if (!run.active) return; }
  for (const e of enemies) if (e.active && Math.hypot(e.x - player.x, e.y - player.y) < e.radius + player.radius) {
    player.hit(run.config.damage * 2.2);
    if (e.type !== 'boss') { e.active = false; if (!e.escort) { run.escaped++; run.resolved++; } explosion(e.x, e.y, e.def.color); }
    if (!run.active) return;
  }
  for (const p of pickups) {
    if (run.phase === 'rest') continue;
    p.age += dt; p.y += 120 * s;
    const distance = Math.hypot(p.x - player.x, p.y - player.y);
    if (distance < 65) { p.x += (player.x - p.x) * s * 4; p.y += (player.y - p.y) * s * 4; }
    if (distance < 38) { p.active = false; player.collect(p.type); }
    if (p.y > H + 45 || p.age > 14000) p.active = false;
  }
  compactActive(enemies); compactActive(bullets); compactActive(enemyBullets); compactActive(pickups);
  for (const p of particles) { p.x += p.vx * s; p.y += p.vy * s; p.life -= s; }
  for (const t of texts) { t.y -= 32 * s; t.life -= s; }
  compactAlive(particles); compactAlive(texts);
  Save.data.stats.totalPlayTime += dt; run.missionTimer += dt;
  if (run.missionTimer >= 1000) { Missions.update('play_time', run.missionTimer / 60000); Missions.update('score_run', run.score); run.missionTimer = 0; }
}
function advance(elapsed) {
  if (!run.active || run.paused) { accumulator = 0; return; }
  accumulator += Math.min(250, Math.max(0, elapsed));
  while (accumulator >= STEP) { simulate(STEP); accumulator -= STEP; }
}

function startRun(mode, level = Save.data.campaignLevel) {
  if (VKAds.busy) { toast('Дождитесь завершения рекламы.'); return; }
  if (!Atlas.ready) { toast(Atlas.error ? 'Проверьте наличие файла атласа в папке assets.' : 'Атлас ещё загружается. Подождите немного.'); return; }
  sessionChanged = true; Audio.unlock(); Missions.check(); clearTimeout(Save.timer); Save.timer = null;
  const safeLevel = clamp(Math.floor(level), 1, Save.data.campaignLevel);
  run = { active: true, paused: false, mode, level: safeLevel, wave: 1, config: mode === 'CAMPAIGN' ? Balance.campaign(safeLevel) : Balance.survival(1),
    time: 0, score: 0, credits: 0, banked: 0, shotsFired: 0, kills: 0, regularKills: 0, escaped: 0, planned: 0, resolved: 0, shake: 0, flash: 0, lastDrop: -10000, missionTimer: 0, bannerUntil: 0, committed: false };
  enemies = []; bullets = []; enemyBullets = []; particles = []; texts = []; pickups = []; accumulator = 0; hudTimer = 0;
  input.keys.clear(); input.pointer = null; player = new Player();
  document.querySelectorAll('.screen').forEach(el => el.classList.add('hidden')); $('hud').classList.remove('hidden');
  $('controlHint').textContent = matchMedia('(pointer: coarse)').matches ? 'ВЕДИТЕ ПАЛЬЦЕМ ПО ЭКРАНУ · ОГОНЬ АВТОМАТИЧЕСКИЙ' : 'WASD / СТРЕЛКИ / МЫШЬ · ОГОНЬ АВТОМАТИЧЕСКИЙ';
  Director.beginWave(); updateHUD();
}
function bankIncome() { if (run.credits > run.banked) { Save.data.credits += run.credits - run.banked; run.banked = run.credits; } }
function commitRun() {
  if (run.committed) return; run.committed = true;
  bankIncome();
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
  $('resultTitle').style.color = victory ? '#91e6b2' : '#f2b1bc'; $('resultEmblem').textContent = victory ? 'MISSION COMPLETE' : 'SIGNAL LOST';
  $('resultEyebrow').textContent = isCampaign ? `КАМПАНИЯ / СЕКТОР ${String(run.level).padStart(2, '0')}` : (run.score > oldRecord ? 'НОВЫЙ РЕКОРД' : 'ВЫЖИВАНИЕ / ОТЧЁТ');
  $('resultSub').textContent = victory ? 'Путь к следующей звёздной системе открыт.' : reason === 'coverage' ? `Уничтожено ${coverage}%. Для победы нужно 60%.` : 'Кредиты сохранены. Флот готов к новому вылету.';
  $('resScore').textContent = fmt(run.score); $('resCredits').textContent = fmt(run.credits); $('resMetricLabel').textContent = isCampaign ? 'УНИЧТОЖЕНО' : 'ВОЛНА';
  $('resMetric').textContent = isCampaign ? `${run.regularKills} / ${run.planned}` : run.wave; $('resTime').textContent = clockText(run.time);
  const nextShip = SHIPS.find(s => !Save.data.unlockedShips.includes(s.id) && s.cost <= Save.data.credits && s.unlock <= Save.data.campaignLevel);
  $('resultTip').textContent = nextShip ? `Доступен новый корпус: ${nextShip.name}. Загляните в ангар.` : victory ? 'Системы флота усиливают все ваши корабли.' : 'Двигайтесь между залпами. Следите за подкреплениями босса.';
  $('resActionBtn').textContent = victory && run.level < MAX_LEVEL ? 'СЛЕДУЮЩИЙ СЕКТОР' : 'ПОВТОРИТЬ ПОЛЁТ';
  const replayMode = run.mode, replayLevel = victory && run.level < MAX_LEVEL ? run.level + 1 : run.level;
  $('resActionBtn').onclick = () => { Audio.play('ui'); startRun(replayMode, replayLevel); }; renderMenu(); VKAds.afterFlight(run.time);
}
function pauseGame() {
  if (!run.active || run.paused) return; run.paused = true; accumulator = 0; input.keys.clear(); input.pointer = null; $('pauseMenu').classList.remove('hidden'); Save.persist(true);
}
function resumeGame() { if (!run.active) return; run.paused = false; lastFrame = performance.now(); accumulator = 0; $('pauseMenu').classList.add('hidden'); }
function showMenu() {
  if (run.active) { run.active = false; commitRun(); VKAds.afterFlight(run.time); }
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
  const names = ['ТИХАЯ ГРАНИЦА', 'ПОЯС ОБЛОМКОВ', 'ТЁМНЫЙ ФРОНТ', 'СЕРДЦЕ ПУСТОТЫ', 'МЁРТВАЯ ОРБИТА', 'ТУМАННОСТЬ ВЕГА', 'ЗВЁЗДНЫЙ РАЗЛОМ', 'ПОСЛЕДНИЙ РУБЕЖ', 'КРАЙ СИНГУЛЯРНОСТИ', 'ПЕПЕЛ СВЕРХНОВОЙ', 'ЦИТАДЕЛЬ БЕЗДНЫ', 'ГОРИЗОНТ СОБЫТИЙ', 'ЛЕДЯНОЕ ЭХО', 'ПЫЛЬ АНТАРЕСА', 'ПОЯС ГОЛИАФА', 'РАСКОЛОТЫЙ МИР', 'ЛАБИРИНТ ПУЛЬСАРОВ', 'ЗАБЫТАЯ ЭСКАДРА', 'ПРЕДЕЛ АТЛАСА', 'ПРИЗРАКИ ОРИОНА', 'ПЕПЕЛ ИМПЕРИИ', 'КОЛЬЦА ТИТАНА', 'НУЛЕВАЯ ЗВЕЗДА', 'ОКО БУРИ', 'ИСТОК ПУСТОТЫ'];
  $('sectorGrid').replaceChildren();
  for (let chapter = 0; chapter < MAX_LEVEL / 10; chapter++) {
    const label = document.createElement('div'); label.className = 'chapter-title'; label.innerHTML = `<span>${String(chapter + 1).padStart(2, '0')} / ${names[chapter]}</span><small>10 СЕКТОРОВ</small>`; $('sectorGrid').append(label);
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
  $('sectorSummary').innerHTML = `<b>СЕКТОР ${String(selectedLevel).padStart(2, '0')} · ${config.waves} ВОЛНЫ${config.boss ? ' + БОСС' : ''}</b><br>Рекомендуемый корпус: ${recommended.name}.<br>Награда: ${fmt(selectedLevel < Save.data.campaignLevel || Save.data.levelBest[selectedLevel] ? config.repeatReward : config.reward)} CR + добыча. Для победы: 60% противников.`;
  $('launchSectorBtn').textContent = `В СЕКТОР ${String(selectedLevel).padStart(2, '0')}`;
}
function drawShopShip(time) {
  const c = $('shipPreviewCanvas').getContext('2d'); c.clearRect(0, 0, 500, 280); Atlas.draw(c, shopIndex, 250, 133 + Math.sin(time * .0012) * 4, 242, -.08);
}
function renderShop() {
  const ship = Balance.stats(shopIndex, Save.data.fleetUpgrades), owned = Save.data.unlockedShips.includes(shopIndex), max = Balance.stats(9, { dmg: MAX_UPGRADE, hp: MAX_UPGRADE, rate: MAX_UPGRADE });
  $('shopCredits').textContent = fmt(Save.data.credits); $('shipNumber').textContent = `${String(shopIndex + 1).padStart(2, '0')} / 10`; $('shipName').textContent = ship.name; $('shipDesc').textContent = ship.role;
  $('shipTier').textContent = `КОРПУС ${String(shopIndex + 1).padStart(2, '0')} / ${owned ? 'В СОСТАВЕ ФЛОТА' : Save.data.campaignLevel < ship.unlock ? 'ЧЕРТЕЖИ В СЕКТОРЕ ' + ship.unlock : 'ДОСТУПЕН К ПОКУПКЕ'}`;
  $('statValDmg').textContent = `${Math.round(ship.dps)} ед/с`; $('statValArmor').textContent = `${ship.hp} HP`; $('statValSpeed').textContent = `${ship.fireRate.toFixed(1)} залп/с`;
  $('statBarDmg').style.width = `${ship.dps / max.dps * 100}%`; $('statBarArmor').style.width = `${ship.hp / max.hp * 100}%`; $('statBarSpeed').style.width = `${ship.fireRate / Balance.stats(4, {rate:MAX_UPGRADE}).fireRate * 100}%`;
  const previous = shopIndex > 0 ? Balance.stats(shopIndex - 1, Save.data.fleetUpgrades) : null;
  $('shipComparison').textContent = previous ? `К предыдущему: урон +${Math.round((ship.dps / previous.dps - 1) * 100)}% · броня +${ship.hp - previous.hp}` : 'Базовый корпус · начало вашего флота';
  $('buyShipBtn').classList.toggle('hidden', owned); $('selectShipBtn').classList.toggle('hidden', !owned); $('shipCost').textContent = fmt(ship.cost); $('buyShipBtn').disabled = Save.data.credits < ship.cost || Save.data.campaignLevel < ship.unlock;
  $('selectShipBtn').disabled = Save.data.currentShip === shopIndex; $('selectShipBtn').textContent = Save.data.currentShip === shopIndex ? 'ГОТОВ К ВЫЛЕТУ' : 'ВЫБРАТЬ КОРАБЛЬ';
  $('shipDots').replaceChildren();
  SHIPS.forEach(s => { const dot = document.createElement('button'); dot.className = `ship-dot ${s.id === shopIndex ? 'selected' : ''}`; dot.setAttribute('aria-label', s.name); dot.onclick = () => { shopIndex = s.id; renderShop(); }; $('shipDots').append(dot); });
  for (const [key, id] of [['dmg', 'Dmg'], ['hp', 'Hp'], ['rate', 'Rate']]) {
    const rank = Save.data.fleetUpgrades[key], cost = Balance.upgradeCost(rank);
    $(`${key}LvlText`).textContent = `РАНГ ${rank} / ${MAX_UPGRADE}`; $(`${key}CostText`).textContent = rank >= MAX_UPGRADE ? 'МАКСИМУМ' : `${fmt(cost)} CR`;
    $(`upgrade${id}Btn`).disabled = false;
    $(`upgrade${id}Btn`).classList.toggle('selected', selectedUpgrade === key);
    $(`upgrade${id}Btn`).setAttribute('aria-pressed', String(selectedUpgrade === key));
  }
  const rank = Save.data.fleetUpgrades[selectedUpgrade], cost = Balance.upgradeCost(rank), names = { dmg: 'ОРУДИЯ', hp: 'БРОНЯ', rate: 'СКОРОСТРЕЛЬНОСТЬ' };
  const before = Balance.stats(shopIndex, Save.data.fleetUpgrades), after = Balance.stats(shopIndex, { ...Save.data.fleetUpgrades, [selectedUpgrade]: Math.min(MAX_UPGRADE, rank + 1) });
  const field = selectedUpgrade === 'dmg' ? 'dps' : selectedUpgrade === 'rate' ? 'fireRate' : 'hp';
  $('upgradeDetail').textContent = rank >= MAX_UPGRADE ? `${names[selectedUpgrade]} · максимальный ранг` : `${names[selectedUpgrade]}: ${field === 'fireRate' ? before[field].toFixed(2) : Math.round(before[field])} → ${field === 'fireRate' ? after[field].toFixed(2) : Math.round(after[field])} ${field === 'hp' ? 'HP' : field === 'fireRate' ? 'залп/с' : 'ед/с'} на этом корпусе`;
  $('buyUpgradeBtn').disabled = rank >= MAX_UPGRADE || Save.data.credits < cost;
  $('buyUpgradeBtn').textContent = rank >= MAX_UPGRADE ? 'СИСТЕМА УЛУЧШЕНА ДО МАКСИМУМА' : `КУПИТЬ УЛУЧШЕНИЕ · ${fmt(cost)} CR`;
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
const boostNodes = {};
function initBoostHUD() {
  for (const type of ['overdrive', 'multishot', 'shield']) {
    let chip = boostNodes[type]?.chip;
    if (!chip) {
      chip = document.createElement('div'); chip.className = 'boost-chip hidden';
      const icon = document.createElement('canvas'); icon.width = icon.height = 50;
      const label = document.createElement('b'); chip.append(icon, label); $('boostHUD').append(chip);
      boostNodes[type] = { chip, icon, label, text: '' };
    }
    Atlas.draw(boostNodes[type].icon.getContext('2d'), MODULES[type].sprite, 25, 25, 50);
  }
}
function textIfChanged(id, value) { const el = $(id), text = String(value); if (el.textContent !== text) el.textContent = text; }
function updateHUD() {
  if (!run.active) return;
  textIfChanged('scoreDisplay', fmt(run.score)); textIfChanged('gameCredits', fmt(run.credits));
  textIfChanged('runLabel', run.mode === 'CAMPAIGN' ? `СЕКТОР ${String(run.level).padStart(2, '0')}` : clockText(run.time));
  textIfChanged('waveLabel', run.phase === 'rest' ? `ПЕРЕДЫШКА · ${Math.ceil(run.restTimer / 1000)}` : `ВОЛНА ${run.wave}${run.mode === 'CAMPAIGN' ? ' / ' + run.config.waves : ''}`);
  const wavePct = clamp((run.resolved - (run.waveResolvedStart || 0)) / Math.max(1, run.waveTotal), 0, 1);
  $('levelProgressBar').style.width = `${run.mode === 'CAMPAIGN' ? Math.min(100, ((run.wave - 1 + wavePct) / run.config.waves) * 100) : wavePct * 100}%`;
  textIfChanged('healthText', `${Math.ceil(player.hp)} / ${player.maxHp}`); $('healthBar').style.width = `${Math.max(0, player.hp / player.maxHp * 100)}%`; $('healthBar').style.background = player.hp < player.maxHp * .3 ? '#ff738c' : '#75e9f5';
  $('waveBanner').style.opacity = run.time < run.bannerUntil ? 1 : 0; $('controlHint').style.opacity = run.time < 7500 ? 1 : 0;
  const boss = enemies.find(e => e.type === 'boss' && e.active); $('bossHUD').classList.toggle('hidden', !boss);
  if (boss) { textIfChanged('bossName', `${boss.boss.name} / ФАЗА ${boss.bossPhase + 1}`); $('bossHealthBar').style.width = `${Math.max(0, boss.hp / boss.maxHp * 100)}%`; }
  for (const type in player.boosts) {
    const node = boostNodes[type]; if (!node) continue;
    const time = player.boosts[type], text = `${MODULES[type].name} ${run.phase === 'rest' ? 'ОЖИДАНИЕ' : Math.ceil(time / 1000) + 'с'}`;
    node.chip.classList.toggle('hidden', time <= 0);
    if (node.text !== text) { node.label.textContent = text; node.text = text; }
  }
}
const background = document.createElement('canvas'); background.width = W; background.height = H;
const bgContext = background.getContext('2d', { alpha: false });
bgContext.fillStyle = '#050c18'; bgContext.fillRect(0, 0, W, H);
const nebula = bgContext.createRadialGradient(80, 260, 0, 90, 400, 690);
nebula.addColorStop(0, '#17314c55'); nebula.addColorStop(.6, '#10213a22'); nebula.addColorStop(1, '#050c1800');
bgContext.fillStyle = nebula; bgContext.fillRect(0, 0, W, H);
function drawBackground(elapsed) {
  ctx.drawImage(background, 0, 0);
  for (const star of stars) { if (!run.paused) star.y += elapsed / 1000 * (run.active ? 32 : 9) * star.z; if (star.y > H) star.y = 0; ctx.globalAlpha = star.z * .7; ctx.fillStyle = '#aacfe7'; ctx.fillRect(star.x, star.y, star.r, star.r * (run.active ? 1.7 : 1)); } ctx.globalAlpha = 1;
}
function render(elapsed, now) {
  drawBackground(elapsed);
  if (run.active) {
    ctx.save(); if (run.shake > .1) ctx.translate(Math.sin(now * .13) * run.shake, Math.cos(now * .11) * run.shake * .6);
    for (const e of enemies) e.draw(ctx);
    for (const p of pickups) Atlas.draw(ctx, MODULES[p.type].sprite, p.x, p.y + Math.sin(p.age * .005) * 2, 45);
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
onClick('buyShipBtn', () => { const ship = SHIPS[shopIndex]; if (Save.data.unlockedShips.includes(ship.id) || Save.data.credits < ship.cost || Save.data.campaignLevel < ship.unlock) return; Save.data.credits -= ship.cost; Save.data.unlockedShips.push(ship.id); Save.data.currentShip = ship.id; sessionChanged = true; Save.persist(true); Audio.play('powerup'); renderShop(); });
onClick('upgradeDmgBtn', () => { selectedUpgrade = 'dmg'; renderShop(); }); onClick('upgradeHpBtn', () => { selectedUpgrade = 'hp'; renderShop(); }); onClick('upgradeRateBtn', () => { selectedUpgrade = 'rate'; renderShop(); });
onClick('buyUpgradeBtn', () => upgrade(selectedUpgrade));
onClick('pauseBtn', pauseGame); onClick('resumeBtn', resumeGame); onClick('quitBtn', showMenu); onClick('resMenuBtn', showMenu);
onClick('missionsBtn', () => { Missions.render(); openPanel('missionsModal'); }); onClick('claimDailyBtn', () => Daily.claim());
onClick('settingsBtn', () => openPanel('settingsModal')); onClick('rulesBtn', () => { renderModules(); openPanel('infoModal'); });
document.querySelectorAll('[data-close]').forEach(button => button.onclick = () => { Audio.play('ui'); showMenu(); });
for (const [key, id] of [['sfx', 'sfxToggle'], ['music', 'musicToggle'], ['shake', 'shakeToggle']]) { $(id).checked = settings[key]; $(id).onchange = e => { settings[key] = e.target.checked; localSet('voidstorm_settings', JSON.stringify(settings)); Audio.music(); }; }

canvas.addEventListener('pointerdown', e => {
  if (!run.active || run.paused || input.pointer !== null) return; e.preventDefault(); Audio.unlock(); input.pointer = e.pointerId; input.lastX = e.clientX; input.lastY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
  pointerMove(e);
});
function pointerMove(e) {
  if (!run.active || run.paused) return;
  const rect = canvas.getBoundingClientRect();
  if (e.pointerType === 'mouse') { player.targetX = (e.clientX - rect.left) * W / rect.width; player.targetY = (e.clientY - rect.top) * H / rect.height; }
  else if (input.pointer === e.pointerId) { player.targetX = (e.clientX - rect.left) * W / rect.width; player.targetY = (e.clientY - rect.top) * H / rect.height - 80; }
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
window.addEventListener('pagehide', () => { if (run.active) { pauseGame(); bankIncome(); } Save.persist(true); });


Missions.check(); renderMenu(); renderShop(); renderModules(); initBoostHUD(); Atlas.init(); Daily.check(); VK.init(); requestAnimationFrame(loop);
// Read-only diagnostics and explicit test hooks for the local regression harness.
window.Voidstorm = { get state() { return run; }, get player() { return player; }, get enemies() { return enemies; }, get bullets() { return bullets; }, get enemyBullets() { return enemyBullets; }, get save() { return Save.data; }, get atlasReady() { return Atlas.ready; } };
