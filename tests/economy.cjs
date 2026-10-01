const B = require('../js/balance.js');
const fs = require('node:fs');
function model(coverage = .75) {
  const save = B.freshSave(), purchases = [], rows = [], chapters = [];
  let income = 0, spent = 0;
  for (let level = 1; level <= B.MAX_LEVEL; level++) {
    save.campaignLevel = level;
    const c = B.campaign(level), id = c.tier;
    // Upgrade evenly whenever money allows; buy the next hull as soon as this
    // one is complete. The policy never checks a sector or a blueprint gate.
    while (true) {
      const u = B.upgradesFor(save);
      for (let rank = 1; rank < B.MAX_UPGRADE; rank++) for (const key of ['dmg', 'rate', 'hp']) {
        if (u[key] === rank && B.canUpgrade(save, save.currentShip, key)) {
          const cost = B.upgradeCost(u[key], save.currentShip); save.credits -= cost; spent += cost; u[key]++;
        }
      }
      const next = save.currentShip + 1;
      if (!Object.values(u).every(rank => rank === B.MAX_UPGRADE) || !B.canBuy(save, next)) break;
      save.credits -= B.SHIPS[next].cost; spent += B.SHIPS[next].cost;
      save.unlockedShips.push(next); save.upgrades[next] = { dmg: 1, hp: 1, rate: 1 }; save.currentShip = next;
      purchases.push({ level, hull: next, cost: B.SHIPS[next].cost });
    }
    const u = B.upgradesFor(save);
    const enemies = [1, 2, 3].reduce((n, wave) => n + c.units + wave % 3, 0);
    // Minimum first-clear income: no gifts, missions, adverts, replays or farming.
    const earned = c.reward + Math.ceil(enemies * coverage) * c.killReward + (c.boss ? c.bossReward : 0);
    rows.push({ level, hull: save.currentShip, ranks: { ...u }, beforeFlight: save.credits, earned });
    save.credits += earned; income += earned;
    if (level % 25 === 0) chapters.push({ chapter: id + 1, endLevel: level, earned: rows.slice(-25).reduce((n,r)=>n+r.earned,0), upgradeCost: [1,2,3,4].reduce((n,r)=>n+B.upgradeCost(r,id)*3,0), nextHullCost: B.SHIPS[id+1]?.cost || 0, balance: save.credits, ranks: { ...u } });
  }
  return { coverage, income, spent, credits: save.credits, hull: save.currentShip, purchases, chapters, rows };
}
if (require.main === module) {
  const models = [.75, .9, 1].map(model);
  fs.writeFileSync('docs/qa/economy-v5.1.json', JSON.stringify(models, null, 2));
  for (const { rows, ...summary } of models) console.log(JSON.stringify(summary));
}
module.exports = { model };
