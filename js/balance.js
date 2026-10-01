/* Shared by the browser and the deterministic balance checks. No DOM dependencies. */
(function (root) {
  'use strict';
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const MAX_LEVEL = 300;
  const MAX_UPGRADE = 5;
  const SHIPS = [
    {"id":0,"name":"ПЕРЕХВАТЧИК","role":"Лёгкий разведчик","interval":240,"weapon":"single","color":"#62e9ff"},
    {"id":1,"name":"ДЖАГГЕРНАУТ","role":"Двойные плазменные орудия","interval":230,"weapon":"double","color":"#84f9ac"},
    {"id":2,"name":"ПРИЗРАК","role":"Трёхлучевая батарея","interval":220,"weapon":"spread","color":"#c795ff"},
    {"id":3,"name":"РЕЛЬСОТРОН","role":"Пробивающий импульс • 2 цели","interval":410,"weapon":"sniper","color":"#ff718a"},
    {"id":4,"name":"ШКВАЛ","role":"Скорострельная плазма","interval":110,"weapon":"rapid","color":"#ffcb69"},
    {"id":5,"name":"КСЕНОС","role":"Плазма + ракеты с узким захватом","interval":200,"weapon":"homing","color":"#64f5d5"},
    {"id":6,"name":"ОМЕГА","role":"Двойная батарея и ракеты поддержки","interval":190,"weapon":"omega","color":"#f6db86"},
    {"id":7,"name":"ПОЛЯРИС","role":"Пробивающий залп • 2 цели","interval":270,"weapon":"lance","color":"#92cfff"},
    {"id":8,"name":"ЗАТМЕНИЕ","role":"Плазменная батарея и ракеты поддержки","interval":180,"weapon":"storm","color":"#c9a1ff"},
    {"id":9,"name":"СИНГУЛЯРНОСТЬ","role":"Флагман • шесть орудий","interval":170,"weapon":"nova","color":"#b3f7ff"}
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

  SHIPS.push(
    { id: 10, name: 'ГЕЛИОС', role: 'Тройной ионный залп • пробитие 2 целей', interval: 150, weapon: 'helios', color: '#ffe1a0' },
    { id: 11, name: 'ЛЕВИАФАН', role: 'Флагман • плазма и ракеты поддержки', interval: 160, weapon: 'leviathan', color: '#9becff' }
  );
  const money = n => Math.round(n / 10) * 10;
  const economicScale = tier => Math.pow(1.32, tier);
  const creditScale = [];
  SHIPS.forEach((ship, id) => Object.assign(ship, {
    sprite: id < 10 ? id : 400 + id - 10, unlock: 1 + id * 25,
    cost: id ? money(10500 * Math.pow(id, 1.4)) : 0,
    dps: 24 * Math.pow(2.05, id), hp: Math.round(100 * Math.pow(1.75, id)), speed: 480,
    projectileSpeed: id >= 10 ? 1800 + (id - 10) * 100 : Math.max(800 + id * 70, ['sniper', 'rapid'].includes(ship.weapon) ? 1050 : 0)
  }));
  Object.assign(ENEMIES, {
    resonator: { name: 'Резонатор', sprite: 402, unlock: 251, hp: 34, speed: 95, radius: 25, threat: 3, score: 340, rate: 1500, shot: 'toxic', color: '#98ff83' },
    rift: { name: 'Разломщик', sprite: 403, unlock: 263, hp: 42, speed: 85, radius: 27, threat: 3, score: 360, rate: 1850, shot: 'plasma', color: '#f17aff' },
    warden: { name: 'Бастионер', sprite: 404, unlock: 277, hp: 70, speed: 65, radius: 33, threat: 4, score: 410, rate: 1500, shot: 'pulse', color: '#ffb775' },
    needle: { name: 'Игла', sprite: 405, unlock: 289, hp: 25, speed: 148, radius: 21, threat: 2, score: 350, rate: 1400, shot: 'shard', color: '#92eaff' }
  });
  BOSSES.push(
    { name: 'ХРОНОС', sprite: 406, mechanic: 'Лучевые дорожки: покиньте отмеченную линию', rate: 1250, size: 180 },
    { name: 'КРАКЕН', sprite: 407, mechanic: 'Астероиды: пробейте себе проход', rate: 1400, size: 190 },
    { name: 'ОБЕЛИСК', sprite: 408, mechanic: 'Пилоны и лучи: расчистите коридор', rate: 1350, size: 190 }
  );
  function stats(shipId, upgrades = {}) {
    const ship = SHIPS[shipId] || SHIPS[0];
    const dmg = clamp(upgrades.dmg || 1, 1, MAX_UPGRADE), hp = clamp(upgrades.hp || 1, 1, MAX_UPGRADE);
    const rate = clamp(upgrades.rate || 1, 1, MAX_UPGRADE), cadence = 1 + (rate - 1) * .05;
    return { ...ship, dps: ship.dps * (1 + (dmg - 1) * .12) * cadence,
      hp: Math.round(ship.hp * (1 + (hp - 1) * .15)), interval: ship.interval / cadence, fireRate: 1000 / ship.interval * cadence };
  }
  const upgradeCost = (rank, shipId = 0) => rank >= MAX_UPGRADE ? 0 : money([0, 300, 600, 1050, 1600][rank] * SHIPS[Math.min(SHIPS.length - 1, shipId + 1)].cost / SHIPS[1].cost);
  const rankAt = level => [1, 5, 10, 16, 21].filter(n => n <= ((level - 1) % 25) + 1).length;
  const upgradesFor = (save, shipId = save.currentShip) => save.upgrades[shipId] || { dmg: 1, hp: 1, rate: 1 };
  const canUse = (save, shipId) => !!SHIPS[shipId] && save.unlockedShips.includes(shipId);
  const canBuy = (save, shipId) => !!SHIPS[shipId] && shipId > 0 && !save.unlockedShips.includes(shipId) && save.credits >= SHIPS[shipId].cost;
  const canUpgrade = (save, shipId, key) => ['dmg', 'hp', 'rate'].includes(key) && canUse(save, shipId) && upgradesFor(save, shipId)[key] < MAX_UPGRADE && save.credits >= upgradeCost(upgradesFor(save, shipId)[key], shipId);
  function statBars(shipId, upgrades = {}) {
    // A common class scale, not a percentage of each hull's own maximum.
    const base = 16 + clamp(shipId, 0, SHIPS.length - 1) * 7;
    const rank = key => clamp(upgrades[key] || 1, 1, MAX_UPGRADE) - 1;
    return { dmg: base + (rank('dmg') + rank('rate')) * .75, hp: base + rank('hp') * 1.5, rate: base + rank('rate') * 1.5 };
  }
  function rewards(tier, stage, multiplier = creditScale[tier] || 1) {
    const scale = economicScale(tier) * multiplier;
    return { reward: money((500 + stage * 18) * scale), repeatReward: money((55 + stage * 2) * scale),
      killReward: Math.max(1, Math.round(6 * scale)), bossReward: money(100 * scale) };
  }
  function chapterIncome(tier, multiplier) {
    let income = 0;
    for (let stage = 1; stage <= 25; stage++) {
      const r = rewards(tier, stage, multiplier), units = 12 + Math.floor(stage / 6) + Math.floor(tier / 3);
      income += r.reward + Math.ceil((units * 3 + 3) * .75) * r.killReward + (stage % 5 === 0 ? r.bossReward : 0);
    }
    return income;
  }
  function campaign(level) {
    level = clamp(Math.floor(level), 1, MAX_LEVEL);
    const tier = Math.floor((level - 1) / 25), stage = (level - 1) % 25 + 1, rank = rankAt(level);
    const expectedDps = SHIPS[tier].dps * (1 + (stage - 1) / 24 * .776);
    const expectedHp = SHIPS[tier].hp * (1 + (stage - 1) / 24 * .6);
    return { level, tier, stage, rank, expectedDps, expectedHp, bossHp: expectedDps * (18 + Math.min(7, level / 40)),
      waves: 3, boss: level % 5 === 0, scale: expectedDps * .62 / 28,
      doctrine: Math.floor((level - 1) / 5) % 6,
      bossKind: level <= 250 ? Math.max(0, Math.floor(level / 5) - 1) % 10 : [10, 1, 11, 3, 12, 6, 10, 11, 9, 12][Math.min(9, Math.floor((level - 251) / 5))],
      maxEnemies: Math.min(10, 6 + Math.floor(level / 55)), maxThreat: Math.max(level % 5 === 0 ? 15 : 12, Math.min(24, 12 + Math.floor(level / 25))),
      maxShooters: Math.min(8, 5 + Math.floor(level / 80)), bulletCap: Math.min(130, 70 + Math.floor(level / 3)),
      interval: Math.max(830, 1000 - level * .5), fireRate: Math.max(.82, 1.04 - level * .00075),
      bulletSpeed: 1 + Math.min(.20, level * .0007), units: 12 + Math.floor(stage / 6) + Math.floor(tier / 3),
      ...rewards(tier, stage),
      damage: expectedHp / 14, speedMult: 1 + Math.min(.18, level * .0007) };
  }
  function survival(wave, startLevel = 1) {
    wave = Math.max(1, Math.floor(wave));
    const level = clamp(Math.floor(startLevel), 1, MAX_LEVEL), base = campaign(level);
    // Anchor never changes with the selected hull; growth continues beyond sector 300.
    const growth = 1 + .075 * (wave - 1) + .003 * Math.pow(wave - 1, 1.35);
    return { ...base, wave, waves: Infinity, level: Math.min(MAX_LEVEL, level + (wave - 1) * 2), boss: wave % 5 === 0,
      bossKind: (Math.floor(level / 5) + Math.floor(wave / 5)) % (level > 250 ? 13 : 10),
      expectedDps: base.expectedDps * growth, bossHp: base.bossHp * growth, scale: base.scale * growth,
      units: Math.min(26, base.units + Math.floor((wave - 1) / 3)),
      maxEnemies: Math.min(11, base.maxEnemies + Math.floor(wave / 10)), maxThreat: Math.min(26, Math.max(15, base.maxThreat) + Math.floor(wave / 8)),
      maxShooters: Math.min(8, base.maxShooters + Math.floor(wave / 12)), interval: Math.max(780, base.interval - wave * 3),
      damage: base.damage * Math.sqrt(growth), bulletCap: Math.min(140, base.bulletCap + wave),
      killReward: base.killReward * 2,
      survivalReward: money((65 + Math.min(50, wave) * 4) * economicScale(base.tier) * creditScale[base.tier]) };
  }
  function waveTypes(config, wave, random = Math.random) {
    const pool = Object.keys(ENEMIES).filter(k => k !== 'boss' && ENEMIES[k].unlock <= config.level);
    const doctrines = [['drone', 'fighter', 'striker', 'corsair', 'needle'], ['scout', 'hunter', 'wraith', 'courier', 'mirage'], ['sniper', 'lancer', 'bomber', 'artillery'], ['tank', 'guardian', 'bulwark', 'aegis', 'warden'], ['elite', 'weaver', 'saw', 'pulsar', 'resonator'], ['minelayer', 'bomber', 'scout', 'oracle', 'rift']];
    const result = [], count = config.units + wave % 3;
    let heavy = 0;
    for (let i = 0; i < count; i++) {
      const eligible = pool.filter(k => heavy < Math.ceil(count * .35) || ENEMIES[k].threat < 3);
      const favored = eligible.filter(k => doctrines[config.doctrine].includes(k));
      const selection = favored.length && random() < .65 ? favored : eligible;
      const type = selection[Math.min(selection.length - 1, Math.floor(random() * selection.length))];
      result.push(type); if (ENEMIES[type].threat >= 3) heavy++;
    }
    // Introduce a new silhouette in its first sector, then mix it with its doctrine.
    const debut = pool.find(k => ENEMIES[k].unlock === config.level);
    if (debut) result[0] = debut;
    return result;
  }
  function waveScale(config, types) {
    return config.expectedDps * .62 * types.length / types.reduce((sum, type) => sum + ENEMIES[type].hp, 0);
  }
  function canSpawn(type, alive, config) {
    const def = ENEMIES[type], active = alive.filter(e => e.active !== false);
    if (def.threat >= 3 && active.filter(e => ENEMIES[e.type].threat >= 3).length >= (config.level < 80 ? 2 : 3)) return false;
    return active.length < config.maxEnemies && active.reduce((n, e) => n + ENEMIES[e.type].threat, 0) + def.threat <= config.maxThreat &&
      (!def.rate || active.filter(e => ENEMIES[e.type].rate).length < config.maxShooters);
  }
  function freshSave() {
    return { version: 5, credits: 0, campaignLevel: 1, completed: false, unlockedShips: [0], currentShip: 0,
      upgrades: { 0: { dmg: 1, hp: 1, rate: 1 } }, highScore: 0, bestWave: 0, bestTime: 0,
      levelBest: {}, daily: { last: null, streak: 0 }, missions: { lastGen: 0, list: [] }, stats: { totalPlayTime: 0 } };
  }
  function migrate(raw) {
    const d = freshSave();
    if (!raw || typeof raw !== 'object') return d;
    const number = (v, fallback, max = 1e12) => Number.isFinite(Number(v)) ? clamp(Number(v), 0, max) : fallback;
    d.credits = Math.floor(number(raw.credits, 0));
    d.campaignLevel = clamp(Math.floor(number(raw.campaignLevel, 1)), 1, MAX_LEVEL);
    d.completed = (raw.completed === true && raw.version >= 5) || number(raw.campaignLevel, 1) > MAX_LEVEL;
    for (const [version, last] of [[2, 40], [3, 120], [4, 250]]) if (raw.completed === true && raw.version === version && d.campaignLevel === last) d.campaignLevel = last + 1;
    d.unlockedShips = [...new Set([0, ...(Array.isArray(raw.unlockedShips) ? raw.unlockedShips : []).filter(n => Number.isInteger(n) && SHIPS[n])])];
    for (const id of d.unlockedShips) {
      d.upgrades[id] = {};
      for (const key of ['dmg', 'hp', 'rate']) d.upgrades[id][key] = raw.version >= 5 ? clamp(Math.floor(number(raw.upgrades?.[id]?.[key], 1, MAX_UPGRADE)), 1, MAX_UPGRADE) : 1;
    }
    if (!(raw.version >= 5)) {
      const oldCost = rank => money(120 + 75 * Math.pow(rank, 1.7));
      const purchased = raw.fleetUpgrades ? [raw.fleetUpgrades] : Object.values(raw.upgrades || {});
      for (const u of purchased) for (const key of ['dmg', 'hp', 'rate']) {
        const rank = clamp(Math.floor(number(u?.[key] ?? (key === 'rate' ? u?.spd : undefined), 1, 20)), 1, 20);
        for (let r = 1; r < rank; r++) d.credits += oldCost(r);
      }
      d.migrationRefund = d.credits - Math.floor(number(raw.credits, 0));
    }
    d.currentShip = canUse(d, raw.currentShip) ? raw.currentShip : Math.max(...d.unlockedShips);
    d.highScore = number(raw.highScore, 0); d.bestWave = number(raw.bestWave, 0); d.bestTime = number(raw.bestTime, 0);
    d.stats.totalPlayTime = number(raw.stats?.totalPlayTime, 0);
    if (raw.daily && typeof raw.daily === 'object') d.daily = { last: typeof raw.daily.last === 'string' ? raw.daily.last : null, streak: Math.floor(number(raw.daily.streak, 0, 6)) };
    if (raw.levelBest && typeof raw.levelBest === 'object') for (let l = 1; l <= MAX_LEVEL; l++) if (raw.levelBest[l]) d.levelBest[l] = Math.floor(number(raw.levelBest[l], 0));
    if (raw.missions && Array.isArray(raw.missions.list)) {
      const ids = ['kill_drone', 'kill_fighter', 'score_run', 'play_time', 'collect_money'];
      d.missions = { lastGen: number(raw.missions.lastGen, 0), list: raw.missions.list.filter(m => m && ids.includes(m.id)).slice(0, 3).map(m => ({ id: m.id, target: Math.max(1, number(m.target, 1)), current: number(m.current, 0), reward: number(m.reward, 200, 10000), claimed: m.claimed === true })) };
    }
    return d;
  }
  // Fund a complete hull and its successor through ~25 first clears. No purchase
  // uses sector gates. Solve after currency rounding so the budget is achievable.
  SHIPS.forEach(ship => {
    const upgrades = [1, 2, 3, 4].reduce((sum, rank) => sum + upgradeCost(rank, ship.id) * 3, 0);
    const target = (upgrades + SHIPS[Math.min(ship.id + 1, SHIPS.length - 1)].cost) * 1.015;
    let low = 0, high = 1;
    while (chapterIncome(ship.id, high) < target) high *= 2;
    for (let i = 0; i < 32; i++) { const mid = (low + high) / 2; if (chapterIncome(ship.id, mid) < target) low = mid; else high = mid; }
    creditScale[ship.id] = high;
  });
  root.Balance = { SHIPS, ENEMIES, BOSSES, MODULES, MAX_LEVEL, MAX_UPGRADE, stats, statBars, upgradeCost, rankAt, upgradesFor, canUse, canBuy, canUpgrade, chapterIncome, campaign, survival, waveTypes, waveScale, canSpawn, freshSave, migrate, clamp };
  if (typeof module !== 'undefined') module.exports = root.Balance;
})(typeof window === 'undefined' ? globalThis : window);
