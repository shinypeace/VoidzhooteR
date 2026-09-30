const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../js/balance.js');
test('12 hulls: next base beats previous fully upgraded, including piercing bonus', () => {
  assert.equal(B.SHIPS.length, 12);
  for (let id=1; id<12; id++) {
    const previous=B.stats(id-1,{dmg:5,hp:5,rate:5}), next=B.stats(id);
    assert(next.dps > previous.dps * 1.12); assert(next.hp > previous.hp);
    assert.equal(next.unlock, id*25+1);
  }
});
test('300 sectors have at least 12 units per wave and bounded live pressure', () => {
  assert.equal(B.MAX_LEVEL, 300);
  for(let level=1;level<=300;level++) {
    const c=B.campaign(level); assert(c.maxEnemies<=10 && c.maxShooters<=8 && c.bulletCap<=130);
    for(const seed of [.01,.49,.999]) for(let wave=1;wave<=3;wave++) {
      const types=B.waveTypes(c,wave,()=>seed); assert(types.length>=12 && types.length<=22);
      assert(types.every(t=>B.ENEMIES[t].unlock<=level));
      const hp=types.reduce((n,t)=>n+B.ENEMIES[t].hp*B.waveScale(c,types),0);
      assert(Math.abs(hp/c.expectedDps-types.length*.62)<1e-8);
    }
  }
});
test('survival starts at campaign strength and grows indefinitely with bounded counts', () => {
  for(const anchor of [1,54,126,250,300]) {
    assert.equal(B.survival(1,anchor).expectedDps,B.campaign(anchor).expectedDps);
    let previous=0;
    for(const wave of [1,5,50,1000,100000]) { const c=B.survival(wave,anchor); assert(c.expectedDps>previous);previous=c.expectedDps;assert(c.maxEnemies<=11 && c.bulletCap<=140 && c.units<=26 && Number.isFinite(c.bossHp)); }
  }
});
test('v4 migration refunds shared upgrades exactly once and preserves owned future hulls', () => {
  const old={version:4,credits:4317,campaignLevel:54,currentShip:9,unlockedShips:[0,1,2,9],fleetUpgrades:{dmg:5,hp:3,rate:4}};
  const d=B.migrate(old); assert(d.credits>old.credits);assert.equal(d.currentShip,2);assert.deepEqual(d.unlockedShips,[0,1,2,9]);
  assert.deepEqual(d.upgrades[2],{dmg:1,hp:1,rate:1});assert.equal(B.migrate(d).credits,d.credits);
  for(const [version,last] of [[2,40],[3,120],[4,250]]) { const save=B.migrate({version,campaignLevel:last,completed:true});assert.equal(save.campaignLevel,last+1);assert.equal(save.completed,false); }
});
test('hull and rank gates cannot be bypassed with credits; upgrades stay on their hull', () => {
  const d=B.freshSave();d.credits=1e9;assert(!B.canBuy(d,1));assert(!B.canUpgrade(d,0,'dmg'));
  d.campaignLevel=26;assert(B.canBuy(d,1));assert(!B.canBuy(d,2));
  d.unlockedShips.push(1);d.upgrades[0].dmg=5;assert.equal(B.upgradesFor(d,1).dmg,1);
  assert(!B.canUpgrade(d,1,'dmg'));d.campaignLevel=30;assert(B.canUpgrade(d,1,'dmg'));
});
test('minimum clear economy funds every hull and every available rank without farming', () => {
  const {model}=require('./economy.cjs'), m=model(.75);
  assert.equal(m.hull,11);assert.equal(m.purchases.length,11);
  m.purchases.forEach(p=>assert.equal(p.level,B.SHIPS[p.hull].unlock));
  for(const r of m.rows) { assert(r.beforeFlight>=0);assert.equal(r.hull,B.campaign(r.level).tier);assert(Object.values(r.ranks).every(n=>n===B.rankAt(r.level)), 'missing rank at '+r.level); }
});
