/* Shared by the browser and the deterministic balance checks. No DOM dependencies. */
(function (root) {
  'use strict';
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const MAX_LEVEL = 250;
  const MAX_UPGRADE = 20;
  const SHIPS = [
    {"id":0,"name":"ПЕРЕХВАТЧИК","role":"Лёгкий разведчик","cost":0,"hp":100,"speed":480,"dps":24,"interval":240,"weapon":"single","color":"#62e9ff","unlock":1},
    {"id":1,"name":"ДЖАГГЕРНАУТ","role":"Двойные плазменные орудия","cost":3500,"hp":124,"speed":480,"dps":30,"interval":230,"weapon":"double","color":"#84f9ac","unlock":10},
    {"id":2,"name":"ПРИЗРАК","role":"Трёхлучевая батарея","cost":11000,"hp":152,"speed":480,"dps":37,"interval":220,"weapon":"spread","color":"#c795ff","unlock":28},
    {"id":3,"name":"РЕЛЬСОТРОН","role":"Пробивающий импульс • 2 цели","cost":18000,"hp":184,"speed":480,"dps":46,"interval":410,"weapon":"sniper","color":"#ff718a","unlock":50},
    {"id":4,"name":"ШКВАЛ","role":"Скорострельная плазма","cost":32000,"hp":220,"speed":480,"dps":57,"interval":110,"weapon":"rapid","color":"#ffcb69","unlock":78},
    {"id":5,"name":"КСЕНОС","role":"Плазма + ракеты с узким захватом","cost":48000,"hp":260,"speed":480,"dps":70,"interval":200,"weapon":"homing","color":"#64f5d5","unlock":110},
    {"id":6,"name":"ОМЕГА","role":"Двойная батарея и ракеты поддержки","cost":66000,"hp":304,"speed":480,"dps":86,"interval":190,"weapon":"omega","color":"#f6db86","unlock":145},
    {"id":7,"name":"ПОЛЯРИС","role":"Пробивающий залп • 2 цели","cost":82000,"hp":352,"speed":480,"dps":105,"interval":270,"weapon":"lance","color":"#92cfff","unlock":180},
    {"id":8,"name":"ЗАТМЕНИЕ","role":"Плазменная батарея и ракеты поддержки","cost":94000,"hp":404,"speed":480,"dps":128,"interval":180,"weapon":"storm","color":"#c9a1ff","unlock":215},
    {"id":9,"name":"СИНГУЛЯРНОСТЬ","role":"Флагман • шесть орудий","cost":110000,"hp":460,"speed":480,"dps":156,"interval":170,"weapon":"nova","color":"#b3f7ff","unlock":240}
  ];
  const ENEMIES = {
    drone:   { name: 'Дрон', sprite: 10, unlock: 1, hp: 11, speed: 100, radius: 22, threat: 1, score: 60, credits: 8, rate: 1900, shot: 'red', color: '#ff6477' },
    scout:   { name: 'Разведчик', sprite: 11, unlock: 2, hp: 12, speed: 155, radius: 19, threat: 1, score: 80, credits: 10, rate: 1600, shot: 'needle', color: '#ffcc66' },
    fighter: { name: 'Истребитель', sprite: 12, unlock: 4, hp: 24, speed: 79, radius: 25, threat: 2, score: 120, credits: 14, rate: 1250, shot: 'laser', color: '#ff9866' },
    hunter:  { name: 'Охотник', sprite: 13, unlock: 7, hp: 26, speed: 105, radius: 24, threat: 2, score: 140, credits: 16, rate: 1450, shot: 'diamond', color: '#f287d3' },
    tank:    { name: 'Броненосец', sprite: 14, unlock: 11, hp: 52, speed: 66, radius: 35, threat: 3, score: 240, credits: 24, rate: 1650, shot: 'orb', color: '#ff697c' },
    sniper:  { name: 'Снайпер', sprite: 15, unlock: 14, hp: 28, speed: 100, radius: 22, threat: 3, score: 220, credits: 22, rate: 1850, shot: 'rail', color: '#b4ee88' },
    elite:   { name: 'Элита', sprite: 16, unlock: 18, hp: 55, speed: 78, radius: 30, threat: 4, score: 300, credits: 30, rate: 1250, shot: 'plasma', color: '#ffa5b9' },
    bomber:  { name: 'Бомбардировщик', sprite: 17, unlock: 23, hp: 46, speed: 75, radius: 32, threat: 3, score: 260, credits: 26, rate: 2100, shot: 'bomb', color: '#ffaa66' },
    guardian:{ name: 'Страж', sprite: 18, unlock: 28, hp: 68, speed: 71, radius: 33, threat: 4, score: 340, credits: 34, rate: 1750, shot: 'ring', color: '#c59aff' },
    boss:    { name: 'Разрушитель', sprite: 19, unlock: 5, hp: 420, speed: 60, radius: 57, threat: 8, score: 1800, credits: 180, rate: 850, shot: 'plasma', color: '#ff607d' }
  };
  const MODULES = {
    health: { name: 'РЕМОНТ', sprite: 20, color: '#84f9ac', duration: 0, desc: 'Восстанавливает 35% брони' },
    overdrive: { name: 'ОВЕРДРАЙВ', sprite: 21, color: '#ca9cff', duration: 8000, desc: 'Скорострельность ×1,6 на 8 секунд' },
    multishot: { name: 'МУЛЬТИ', sprite: 22, color: '#62e9ff', duration: 8000, desc: 'Два дополнительных луча на 8 секунд' },
    shield: { name: 'ЩИТ', sprite: 23, color: '#91b9ff', duration: 6000, desc: 'Защищает от урона 6 секунд' }
  };
  Object.assign(ENEMIES, {
    striker: { name: 'Ударник', sprite: 100, unlock: 42, hp: 27, speed: 105, radius: 24, threat: 2, score: 180, credits: 18, rate: 1300, shot: 'fork', color: '#ff596b' },
    weaver: { name: 'Ткач', sprite: 101, unlock: 65, hp: 31, speed: 91, radius: 24, threat: 3, score: 220, credits: 22, rate: 1550, shot: 'arc', color: '#f190ed' },
    lancer: { name: 'Копейщик', sprite: 102, unlock: 95, hp: 38, speed: 79, radius: 26, threat: 3, score: 250, credits: 25, rate: 1700, shot: 'shard', color: '#92e9ff' },
    bulwark: { name: 'Оплот', sprite: 103, unlock: 130, hp: 72, speed: 66, radius: 34, threat: 4, score: 360, credits: 36, rate: 1900, shot: 'pulse', color: '#ffc573' },
    minelayer: { name: 'Заградитель', sprite: 104, unlock: 165, hp: 45, speed: 77, radius: 30, threat: 3, score: 280, credits: 28, rate: 2200, shot: 'mine', color: '#ffa461' },
    wraith: { name: 'Фантом', sprite: 105, unlock: 200, hp: 34, speed: 137, radius: 22, threat: 3, score: 280, credits: 28, rate: 1500, shot: 'toxic', color: '#8fffab' }
  });
  Object.assign(ENEMIES, {
    corsair: { name: 'Корсар', sprite: 300, unlock: 34, hp: 29, speed: 112, radius: 24, threat: 2, score: 190, credits: 19, rate: 1450, shot: 'fork', color: '#ff6e81' },
    pulsar: { name: 'Пульсар', sprite: 301, unlock: 55, hp: 38, speed: 80, radius: 26, threat: 3, score: 240, credits: 24, rate: 1550, shot: 'pulse', color: '#8eefff' },
    saw: { name: 'Серп', sprite: 302, unlock: 85, hp: 30, speed: 126, radius: 26, threat: 3, score: 230, credits: 23, rate: 1350, shot: 'arc', color: '#bb8cff' },
    artillery: { name: 'Мортира', sprite: 303, unlock: 120, hp: 64, speed: 60, radius: 33, threat: 4, score: 350, credits: 35, rate: 1800, shot: 'orb', color: '#ffbb69' },
    courier: { name: 'Конвой', sprite: 304, unlock: 155, hp: 24, speed: 178, radius: 24, threat: 2, score: 240, credits: 40, rate: 1350, shot: 'needle', color: '#ffdc88' },
    aegis: { name: 'Эгида', sprite: 305, unlock: 185, hp: 55, speed: 75, radius: 32, threat: 4, score: 350, credits: 35, rate: 1750, shot: 'ring', color: '#82c6ff' },
    mirage: { name: 'Мираж', sprite: 306, unlock: 220, hp: 32, speed: 125, radius: 25, threat: 3, score: 290, credits: 29, rate: 1550, shot: 'plasma', color: '#75fbdc' },
    oracle: { name: 'Оракул', sprite: 307, unlock: 235, hp: 58, speed: 72, radius: 31, threat: 4, score: 390, credits: 39, rate: 2000, shot: 'mine', color: '#ed8fe8' }
  });
  const BOSSES = [
    { name: 'СТРАЖ РУБЕЖА', sprite: 106, mechanic: 'Маятник: веера и коридоры', rate: 1100, size: 150 },
    { name: 'АРК-НОСИТЕЛЬ', sprite: 107, mechanic: 'Ангары: пуски эскорта и бомб', rate: 1400, size: 168 },
    { name: 'ЖНЕЦ', sprite: 108, mechanic: 'Рывки: остановка перед залпом', rate: 1000, size: 160 },
    { name: 'БЛИЗНЕЦЫ', sprite: 109, mechanic: 'Два корпуса: чередование батарей', rate: 850, size: 165 },
    { name: 'КУЗНЯ', sprite: 110, mechanic: 'Четыре турели: очередь и перезарядка', rate: 650, size: 168 },
    { name: 'УЛЕЙ', sprite: 111, mechanic: 'Мины, кольца и рой дронов', rate: 1600, size: 172 },
    { name: 'ПРИЗМА', sprite: 112, mechanic: 'Щит: усиленная броня между импульсами', rate: 1100, size: 158 },
    { name: 'ТЕМПЕСТ', sprite: 113, mechanic: 'Спираль: движущиеся проходы', rate: 340, size: 170 },
    { name: 'БАСТИОН', sprite: 114, mechanic: 'Осадные батареи и сброс брони', rate: 1000, size: 182 },
    { name: 'ТИТАН ПУСТОТЫ', sprite: 115, mechanic: 'Три фазы: веера, спираль, кассеты', rate: 820, size: 182 }
  ];
  function stats(shipId, upgrades = {}) {
    const ship = SHIPS[shipId] || SHIPS[0];
    const dmg = clamp(upgrades.dmg || 1, 1, MAX_UPGRADE), hp = clamp(upgrades.hp || 1, 1, MAX_UPGRADE);
    const rate = clamp(upgrades.rate || upgrades.spd || 1, 1, MAX_UPGRADE);
    const cadence = 1 + (rate - 1) * .025;
    return { ...ship, dps: ship.dps * (1 + (dmg - 1) * .07) * cadence,
      hp: Math.round(ship.hp * (1 + (hp - 1) * .09)), interval: ship.interval / cadence, fireRate: 1000 / ship.interval * cadence };
  }
  const upgradeCost = rank => Math.round((120 + 75 * Math.pow(rank, 1.7)) / 10) * 10;
  const rankAt = level => Math.min(MAX_UPGRADE, 1 + Math.floor((level - 1) / 13));
  function campaign(level) {
    level = clamp(Math.floor(level), 1, MAX_LEVEL);
    const tier = SHIPS.filter(s => s.unlock <= level).length - 1;
    const rank = rankAt(level);
    // Interpolate power through a hull's chapter: no sudden HP wall at purchase milestones.
    const next = SHIPS[Math.min(9, tier + 1)], current = SHIPS[tier];
    const progress = next === current ? 0 : (level - current.unlock) / (next.unlock - current.unlock);
    const basePower = current.dps + (next.dps - current.dps) * progress * .6;
    const expectedDps = basePower * (1 + (rank - 1) * .07) * (1 + (rank - 1) * .025);
    return { level, tier, rank, expectedDps, bossHp: expectedDps * (12 + Math.min(14, level * .065)),
      waves: level >= 101 ? 4 : 3, boss: level % 5 === 0, scale: expectedDps / 24 * (.54 - level * .00035),
      doctrine: Math.floor((level - 1) / 5) % 6, bossKind: Math.floor(level / 5 - 1 + 10) % 10,
      maxEnemies: Math.min(10, 5 + Math.floor(level / 28)), maxThreat: Math.max(level % 5 === 0 ? 14 : 0, Math.min(23, 9 + Math.floor(level / 16))),
      maxShooters: Math.min(8, 4 + Math.floor(level / 35)), bulletCap: Math.min(120, 68 + Math.floor(level / 2)),
      interval: Math.max(780, 1280 - level * 2.5), fireRate: Math.max(.80, 1.12 - level * .0014),
      bulletSpeed: 1 + Math.min(.22, level * .0009), budget: Math.min(30, 9 + Math.floor(level / 11)),
      reward: 350 + level * 18, repeatReward: 100 + level * 5,
      damage: Math.min(68, 10 + level * .23), speedMult: 1 + Math.min(.22, level * .001) };
  }
  function survival(wave) {
    wave = Math.max(1, Math.floor(wave));
    const level = Math.min(MAX_LEVEL, 1 + (wave - 1) * 5), base = campaign(level);
    const excess = Math.log1p(Math.max(0, wave - 50));
    return { ...base, wave, waves: Infinity, boss: wave % 5 === 0,
      bossKind: Math.max(0, Math.floor(wave / 5 - 1)) % BOSSES.length,
      bossHp: base.bossHp * (1 + excess * .22), scale: base.scale * (1 + excess * .18),
      maxEnemies: Math.min(11, 5 + Math.floor(wave / 6)), maxThreat: Math.max(wave % 5 === 0 ? 14 : 0, Math.min(24, 9 + Math.floor(wave / 3))),
      maxShooters: Math.min(8, 4 + Math.floor(wave / 7)), interval: Math.max(780, 1280 - wave * 13),
      budget: Math.min(34, 9 + Math.floor(wave / 2)), damage: Math.min(110, base.damage + excess * 5), bulletCap: Math.min(130, 68 + wave) };
  }
  function waveTypes(config, wave, random = Math.random) {
    const pool = Object.keys(ENEMIES).filter(k => k !== 'boss' && ENEMIES[k].unlock <= config.level);
    let budget = config.budget + (wave % 3) * 2;
    const result = [];
    while (budget > 0) {
      const eligible = pool.filter(k => ENEMIES[k].threat <= budget);
      const doctrines = [['drone', 'fighter', 'striker', 'corsair'], ['scout', 'hunter', 'wraith', 'courier', 'mirage'], ['sniper', 'lancer', 'bomber', 'artillery'], ['tank', 'guardian', 'bulwark', 'aegis'], ['elite', 'weaver', 'saw', 'pulsar'], ['minelayer', 'bomber', 'scout', 'oracle']];
      const favored = eligible.filter(k => doctrines[config.doctrine].includes(k));
      const selection = favored.length && random() < .65 ? favored : eligible;
      const type = selection[Math.floor(random() * selection.length)];
      result.push(type); budget -= ENEMIES[type].threat;
    }
    return result;
  }
  function canSpawn(type, alive, config) {
    const def = ENEMIES[type];
    const active = alive.filter(e => e.active !== false);
    // Heavy batteries need room for their patterns; avoid a full screen of overlapping fans.
    if (def.threat >= 3 && active.filter(e => ENEMIES[e.type].threat >= 3).length >= (config.level < 80 ? 2 : 3)) return false;
    return active.length < config.maxEnemies && active.reduce((n, e) => n + ENEMIES[e.type].threat, 0) + def.threat <= config.maxThreat &&
      (!def.rate || active.filter(e => ENEMIES[e.type].rate).length < config.maxShooters);
  }
  function freshSave() {
    return { version: 4, credits: 0, campaignLevel: 1, completed: false, unlockedShips: [0], currentShip: 0,
      fleetUpgrades: { dmg: 1, hp: 1, rate: 1 }, upgrades: {}, highScore: 0, bestWave: 0, bestTime: 0,
      levelBest: {}, daily: { last: null, streak: 0 }, missions: { lastGen: 0, list: [] }, stats: { totalPlayTime: 0 } };
  }
  function migrate(raw) {
    const d = freshSave();
    if (!raw || typeof raw !== 'object') return d;
    const number = (v, fallback, max = 1e12) => Number.isFinite(Number(v)) ? clamp(Number(v), 0, max) : fallback;
    d.credits = Math.floor(number(raw.credits, 0));
    d.campaignLevel = clamp(Math.floor(number(raw.campaignLevel, 1)), 1, MAX_LEVEL);
    d.completed = (raw.completed === true && raw.version >= 4) || number(raw.campaignLevel, 1) > MAX_LEVEL;
    if (raw.completed === true && raw.version === 3 && d.campaignLevel === 120) d.campaignLevel = 121;
    if (raw.completed === true && raw.version === 2 && d.campaignLevel === 40) d.campaignLevel = 41;
    d.unlockedShips = [...new Set([0, ...(Array.isArray(raw.unlockedShips) ? raw.unlockedShips : []).filter(n => Number.isInteger(n) && SHIPS[n])])];
    d.currentShip = d.unlockedShips.includes(raw.currentShip) ? raw.currentShip : 0;
    for (const key of ['dmg', 'hp', 'rate']) {
      const legacy = Object.values(raw.upgrades || {}).map(u => number(u && (u[key] ?? (key === 'rate' ? u.spd : undefined)), 1, MAX_UPGRADE));
      d.fleetUpgrades[key] = clamp(Math.floor(Math.max(1, number(raw.fleetUpgrades && (raw.fleetUpgrades[key] ?? (key === 'rate' ? raw.fleetUpgrades.spd : undefined)), 1, MAX_UPGRADE), ...legacy)), 1, MAX_UPGRADE);
    }
    d.highScore = number(raw.highScore, 0); d.bestWave = number(raw.bestWave, 0); d.bestTime = number(raw.bestTime, 0);
    d.stats.totalPlayTime = number(raw.stats && raw.stats.totalPlayTime, 0);
    if (raw.daily && typeof raw.daily === 'object') d.daily = { last: typeof raw.daily.last === 'string' ? raw.daily.last : null, streak: Math.floor(number(raw.daily.streak, 0, 6)) };
    if (raw.levelBest && typeof raw.levelBest === 'object') {
      for (let l = 1; l <= MAX_LEVEL; l++) if (raw.levelBest[l]) d.levelBest[l] = Math.floor(number(raw.levelBest[l], 0));
    }
    if (raw.missions && Array.isArray(raw.missions.list)) {
      const ids = ['kill_drone', 'kill_fighter', 'score_run', 'play_time', 'collect_money'];
      d.missions = { lastGen: number(raw.missions.lastGen, 0), list: raw.missions.list.filter(m => m && ids.includes(m.id)).slice(0, 3).map(m => ({ id: m.id, target: Math.max(1, number(m.target, 1)), current: number(m.current, 0), reward: number(m.reward, 200, 10000), claimed: m.claimed === true })) };
    }
    return d;
  }
  root.Balance = { SHIPS, ENEMIES, BOSSES, MODULES, MAX_LEVEL, MAX_UPGRADE, stats, upgradeCost, rankAt, campaign, survival, waveTypes, canSpawn, freshSave, migrate, clamp };
  if (typeof module !== 'undefined') module.exports = root.Balance;
})(typeof window === 'undefined' ? globalThis : window);
