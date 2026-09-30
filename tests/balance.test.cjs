const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../js/balance.js');
test('all ten hulls improve actual DPS and health at every fleet rank', () => {
  for (let rank = 1; rank <= B.MAX_UPGRADE; rank++) for (let i = 1; i < B.SHIPS.length; i++) {
    const u = { dmg: rank, hp: rank, spd: rank }, a = B.stats(i - 1, u), b = B.stats(i, u);
    for (const key of ['dps', 'hp']) assert(b[key] > a[key], `${key}: hull ${i}, rank ${rank}`);
  }
});
test('250 sectors have bounded finite wave budgets, including sector 19', () => {
  assert.equal(B.MAX_LEVEL, 250);
  for (let level = 1; level <= B.MAX_LEVEL; level++) {
    const c = B.campaign(level);
    assert(c.maxEnemies <= 10 && c.maxShooters <= 8 && c.bulletCap <= 130);
    assert(Number.isFinite(c.scale) && c.scale < 25);
    for (const seed of [.01, .19, .49, .81, .999]) for (let wave = 1; wave <= c.waves; wave++) {
      const types = B.waveTypes(c, wave, () => seed);
      assert(types.length > 0 && types.length <= 40);
      const total = types.reduce((sum, type) => sum + B.ENEMIES[type].threat, 0);
      assert.equal(total, c.budget + wave % 3 * 2);
      for (const type of types) assert(B.ENEMIES[type].unlock <= level);
    }
  }
  const c = B.campaign(19); assert(c.maxEnemies <= 7); assert(c.maxShooters >= 4); assert(c.bulletCap >= 75);
});
test('survival scales without unbounded population or projectile counts', () => {
  for (const wave of [1, 5, 19, 50, 100, 1000, 100000]) {
    const c = B.survival(wave); assert(c.maxEnemies <= 11); assert(c.maxShooters <= 8); assert(c.bulletCap <= 140); assert(c.budget <= 36); assert(Number.isFinite(c.scale));
  }
});
test('old saves retain purchases and best ranks; completed 40-sector campaign opens sector 41', () => {
  const legacy = { credits: 4317, campaignLevel: 19, currentShip: 3, unlockedShips: [0, 1, 3], upgrades: { 0: { dmg: 2, hp: 3, spd: 4 }, 3: { dmg: 5, hp: 2, spd: 1 } } };
  const d = B.migrate(legacy); assert.equal(d.credits, 4317); assert.equal(d.campaignLevel, 19); assert.equal(d.currentShip, 3);
  assert.deepEqual(d.unlockedShips, [0, 1, 3]); assert.deepEqual(d.fleetUpgrades, { dmg: 5, hp: 3, rate: 4 });
  const complete = B.migrate({ version: 2, campaignLevel: 40, completed: true }); assert.equal(complete.campaignLevel, 41); assert.equal(complete.completed, false);
  assert.deepEqual(B.migrate({ credits: 'bad', currentShip: 90, fleetUpgrades: { dmg: -5, hp: 1e9, spd: NaN } }).fleetUpgrades, { dmg: 1, hp: 20, rate: 1 });
});
