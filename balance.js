/* Shared by the browser and the deterministic balance checks. No DOM dependencies. */
(function (root) {
  'use strict';
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const MAX_LEVEL = 120;
  const MAX_UPGRADE = 12;
  const SHIPS = [
    { id: 0, name: 'ПЕРЕХВАТЧИК', role: 'Лёгкий разведчик', cost: 0, hp: 100, speed: 330, dps: 24, interval: 220, weapon: 'single', color: '#62e9ff' },
    { id: 1, name: 'ДЖАГГЕРНАУТ', role: 'Двойные плазменные орудия', cost: 1000, hp: 124, speed: 345, dps: 32, interval: 230, weapon: 'double', color: '#84f9ac' },
    { id: 2, name: 'ПРИЗРАК', role: 'Трёхлучевая батарея', cost: 2600, hp: 150, speed: 360, dps: 42, interval: 240, weapon: 'spread', color: '#c795ff' },
    { id: 3, name: 'РЕЛЬСОТРОН', role: 'Пробивающий импульс • 3 цели', cost: 5000, hp: 178, speed: 375, dps: 55, interval: 500, weapon: 'sniper', color: '#ff718a' },
    { id: 4, name: 'ШКВАЛ', role: 'Скорострельная плазма', cost: 8500, hp: 208, speed: 390, dps: 70, interval: 100, weapon: 'rapid', color: '#ffcb69' },
    { id: 5, name: 'КСЕНОС', role: 'Самонаводящиеся заряды', cost: 13000, hp: 240, speed: 405, dps: 88, interval: 210, weapon: 'homing', color: '#64f5d5' },
    { id: 6, name: 'ОМЕГА', role: 'Сдвоенные пушки с наведением', cost: 19000, hp: 275, speed: 420, dps: 110, interval: 160, weapon: 'omega', color: '#f6db86' },
    { id: 7, name: 'ПОЛЯРИС', role: 'Тройной пробивающий залп с наведением', cost: 27000, hp: 312, speed: 435, dps: 135, interval: 280, weapon: 'lance', color: '#92cfff' },
    { id: 8, name: 'ЗАТМЕНИЕ', role: 'Наводящаяся плазменная батарея', cost: 37000, hp: 352, speed: 450, dps: 164, interval: 170, weapon: 'storm', color: '#c9a1ff' },
    { id: 9, name: 'СИНГУЛЯРНОСТЬ', role: 'Флагман • шесть орудий', cost: 50000, hp: 395, speed: 465, dps: 198, interval: 180, weapon: 'nova', color: '#b3f7ff' }
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
  function stats(shipId, upgrades) {
    const ship = SHIPS[shipId] || SHIPS[0];
    const u = upgrades || { dmg: 1, hp: 1, spd: 1 };
    return { ...ship, dps: ship.dps * (1 + (u.dmg - 1) * .12), hp: Math.round(ship.hp * (1 + (u.hp - 1) * .14)), speed: ship.speed * (1 + (u.spd - 1) * .045) };
  }
  const upgradeCost = rank => Math.round(180 * Math.pow(1.65, rank - 1) / 10) * 10;
  function campaign(level) {
    level = clamp(Math.floor(level), 1, MAX_LEVEL);
    const tier = Math.min(9, Math.floor((level - 1) / 4));
    const expectedDps = SHIPS[tier].dps * (1 + Math.min(11, Math.floor(level / 10)) * .12);
    const bossHp = expectedDps * (tier < 5 ? (level < 10 ? 14 : 11 + Math.max(0, level - 15) * .4) : 24 + level * .14);
    return { level, tier, bossHp, waves: level >= 61 ? 4 : 3, boss: level % 5 === 0, scale: 1 + (level - 1) * .062 + Math.pow(level / 120, 2) * 2.4,
      doctrine: Math.floor((level - 1) / 5) % 4, bossKind: Math.floor(level / 5 - 1) % 3,
      maxEnemies: Math.min(10, 5 + Math.floor(level / 9)), maxThreat: Math.max(level % 5 === 0 ? 14 : 0, Math.min(23, 8 + Math.floor(level / 4))),
      maxShooters: Math.min(8, 4 + Math.floor(level / 12)), bulletCap: Math.min(130, 65 + level), interval: Math.max(780, 1430 - level * 13),
      fireRate: Math.max(.68, 1.15 - level * .007), bulletSpeed: 1 + Math.min(.28, level * .0025),
      budget: Math.min(34, 8 + Math.floor(level * .38)), reward: 200 + level * 55, repeatReward: 100 + level * 18,
      damage: Math.min(88, 10 + level * .62), speedMult: 1 + Math.min(.27, level * .004) };
  }
  function survival(wave) {
    wave = Math.max(1, Math.floor(wave));
    const level = Math.min(MAX_LEVEL, 1 + (wave - 1) * 3);
    const base = campaign(level);
    return { ...base, level, wave, waves: Infinity, boss: wave % 5 === 0, bossHp: 350 * (1 + wave * .16) * (1 + Math.min(6, wave * .07)),
      bossKind: Math.max(0, Math.floor(wave / 5 - 1)) % 3,
      scale: 1 + Math.min(9, (wave - 1) * .22) + Math.log1p(Math.max(0, wave - 42)) * .9,
      maxEnemies: Math.min(11, 5 + Math.floor(wave / 4)), maxThreat: Math.max(wave % 5 === 0 ? 14 : 0, Math.min(24, 8 + Math.floor(wave / 2))),
      maxShooters: Math.min(8, 4 + Math.floor(wave / 5)), interval: Math.max(780, 1430 - wave * 24),
      budget: Math.min(36, 8 + wave), damage: Math.min(98, 10 + wave * 1.4), bulletCap: Math.min(140, 64 + wave * 3) };
  }
  function waveTypes(config, wave, random = Math.random) {
    const pool = Object.keys(ENEMIES).filter(k => k !== 'boss' && ENEMIES[k].unlock <= config.level);
    let budget = config.budget + (wave % 3) * 2;
    const result = [];
    while (budget > 0) {
      const eligible = pool.filter(k => ENEMIES[k].threat <= budget);
      const doctrines = [['drone', 'fighter', 'elite'], ['scout', 'hunter'], ['fighter', 'sniper', 'bomber'], ['tank', 'guardian', 'elite']];
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
    return active.length < config.maxEnemies && active.reduce((n, e) => n + ENEMIES[e.type].threat, 0) + def.threat <= config.maxThreat &&
      (!def.rate || active.filter(e => ENEMIES[e.type].rate).length < config.maxShooters);
  }
  function freshSave() {
    return { version: 3, credits: 0, campaignLevel: 1, completed: false, unlockedShips: [0], currentShip: 0,
      fleetUpgrades: { dmg: 1, hp: 1, spd: 1 }, upgrades: {}, highScore: 0, bestWave: 0, bestTime: 0,
      levelBest: {}, daily: { last: null, streak: 0 }, missions: { lastGen: 0, list: [] }, stats: { totalPlayTime: 0 } };
  }
  function migrate(raw) {
    const d = freshSave();
    if (!raw || typeof raw !== 'object') return d;
    const number = (v, fallback, max = 1e12) => Number.isFinite(Number(v)) ? clamp(Number(v), 0, max) : fallback;
    d.credits = Math.floor(number(raw.credits, 0));
    d.campaignLevel = clamp(Math.floor(number(raw.campaignLevel, 1)), 1, MAX_LEVEL);
    d.completed = (raw.completed === true && raw.version >= 3) || number(raw.campaignLevel, 1) > MAX_LEVEL;
    if (raw.completed === true && raw.version === 2 && d.campaignLevel === 40) d.campaignLevel = 41;
    d.unlockedShips = [...new Set([0, ...(Array.isArray(raw.unlockedShips) ? raw.unlockedShips : []).filter(n => Number.isInteger(n) && SHIPS[n])])];
    d.currentShip = d.unlockedShips.includes(raw.currentShip) ? raw.currentShip : 0;
    for (const key of ['dmg', 'hp', 'spd']) {
      const legacy = Object.values(raw.upgrades || {}).map(u => number(u && u[key], 1, MAX_UPGRADE));
      d.fleetUpgrades[key] = clamp(Math.floor(Math.max(1, number(raw.fleetUpgrades && raw.fleetUpgrades[key], 1, MAX_UPGRADE), ...legacy)), 1, MAX_UPGRADE);
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
  root.Balance = { SHIPS, ENEMIES, MODULES, MAX_LEVEL, MAX_UPGRADE, stats, upgradeCost, campaign, survival, waveTypes, canSpawn, freshSave, migrate, clamp };
  if (typeof module !== 'undefined') module.exports = root.Balance;
})(typeof window === 'undefined' ? globalThis : window);
