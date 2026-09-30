// First-clear income only: no ads, daily gifts, retries, missions or survival farming.
const B = require('../js/balance.js');
const fs = require('node:fs');
const path = require('node:path');
function model(coverage = .75) {
  let seed = 1729, credits = 0, income = 0, spent = 0, hull = 0;
  const rng = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const ranks = { dmg: 1, hp: 1, rate: 1 }, purchases = [], rows = [];
  function buy(level) {
    const next = B.SHIPS[hull + 1];
    if (next && level >= next.unlock && credits >= next.cost) {
      credits -= next.cost; spent += next.cost; hull++; purchases.push({ level, hull: next.name, cost: next.cost });
    }
    const target = B.rankAt(level);
    for (const key of ['dmg', 'rate', 'hp']) while (ranks[key] < target) {
      const cost = B.upgradeCost(ranks[key]);
      const reserve = B.SHIPS[hull + 1] && B.SHIPS[hull + 1].unlock - level <= 7 ? B.SHIPS[hull + 1].cost : 0;
      if (credits - reserve < cost) break;
      credits -= cost; spent += cost; ranks[key]++;
    }
  }
  for (let level = 1; level <= B.MAX_LEVEL; level++) {
    buy(level);
    const c = B.campaign(level);
    // Average 30 seeded formations per wave, not a hand-estimated kill count.
    let loot = 0;
    for (let sample = 0; sample < 30; sample++) for (let wave = 1; wave <= c.waves; wave++) {
      loot += B.waveTypes(c, wave, rng).reduce((n, type) => n + B.ENEMIES[type].credits, 0) * coverage / 30;
    }
    const earned = Math.round(c.reward + loot + (c.boss ? B.ENEMIES.boss.credits : 0));
    credits += earned; income += earned;
    rows.push({ level, earned, credits, hull, ranks: { ...ranks }, recommendedHull: c.tier });
  }
  buy(B.MAX_LEVEL);
  return { coverage, income, spent, credits, hull, ranks, purchases, rows };
}
if (require.main === module) {
  const models = [.60, .75, .90].map(model);
  const out = path.join(__dirname, '../docs/qa'); fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'economy-v4.json'), JSON.stringify(models, null, 2));
  for (const { rows, ...summary } of models) console.log(JSON.stringify(summary));
}
module.exports = { model };
