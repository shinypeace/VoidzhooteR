// Deterministic play probes: they expose difficulty cliffs, not a substitute for human playtesting.
const fs = require('node:fs');
const path = require('node:path');
const { runtime } = require('./runtime.cjs');
const rows = [];
const levels = process.env.PROBE_ALL ? Array.from({length:250},(_,i)=>i+1) : process.env.PROBE_LEVELS ? process.env.PROBE_LEVELS.split(',').map(Number) : [1,5,15,19,50,110,145,180,215,250];
const seeds = process.env.PROBE_SEEDS ? process.env.PROBE_SEEDS.split(',').map(Number) : [114];
for (const level of levels) for (const seed of seeds) for (const pilot of (process.env.PROBE_ALL ? ['active'] : ['stationary', 'active'])) {
  const r = runtime(seed + level);
  const result = r.run(`
    Save.data.campaignLevel=250;
    Save.data.currentShip=Balance.campaign(${level}).tier;
    Save.data.unlockedShips=SHIPS.map(s=>s.id);
    var rank=Balance.rankAt(${level});
    Save.data.fleetUpgrades={dmg:rank,hp:rank,rate:rank};
    startRun('CAMPAIGN',${level});
    var maxEnemies=0,maxShots=0,bossSeconds=0;
    for(let tick=0;tick<60*300 && run.active;tick++) {
      if ('${pilot}'==='active' && tick%6===0) {
        var target=null,best=-Infinity;
        for(const enemy of enemies) if(enemy.active && enemy.y>10 && enemy.y<870) {
          var priority=enemy.y + (enemy.type==='boss'?300:0) - enemy.hp*.1;
          if(priority>best){best=priority;target=enemy;}
        }
        var lead=target?Math.min(.85,Math.max(0,(920-target.y)/850)):0;
        var velocity=target && target.probeX!==undefined?(target.x-target.probeX)/.1:0;
        var desired=target?Math.max(32,Math.min(568,target.x+velocity*lead*.8)):300;
        for(const e of enemies)e.probeX=e.x;
        var cargo=pickups.find(p=>p.active && p.y>650 && p.y<990 && ((p.type==='health' && player.hp<player.maxHp*.85)||p.type==='shield'));
        var desiredY=cargo?cargo.y:920;if(cargo)desired=cargo.x;
        var bestX=player.x,bestScore=-Infinity;
        for(let x=32;x<=568;x+=16) {
          var score=-Math.abs(x-desired)*.6-Math.abs(x-player.x)*.12;
          for(const b of enemyBullets) if(b.active && b.vy>0) {
            var t=(desiredY-b.y)/b.vy;
            if(t>=-.15 && t<.9) {
              var distance=Math.abs(x-(b.x+b.vx*t));
              if(distance<42) score-=(42-distance)*32;
            }
          }
          for(const e of enemies) if(e.active && e.y>desiredY-130 && e.y<desiredY+100) {var distance=Math.abs(x-e.x);if(distance<e.radius+30)score-=1000;}
          if(score>bestScore){bestScore=score;bestX=x;}
        }
        player.targetX=bestX;player.targetY=desiredY;
        if(run.phase==='rest' && pickups.length){player.targetX=pickups[0].x;player.targetY=pickups[0].y;}
      }
      simulate(STEP);
      maxEnemies=Math.max(maxEnemies,enemies.length);maxShots=Math.max(maxShots,enemyBullets.length);
      if(run.phase==='boss')bossSeconds+=1/60;
    }
    ({level:${level},seed:${seed},pilot:'${pilot}',ship:player.stats.name,rank,seconds:Math.round(run.time/1000),won:!!Save.data.levelBest[${level}],alive:player.hp>0,unfinished:run.active,coverage:Math.round(run.regularKills/Math.max(1,run.planned)*100),hp:Math.round(player.hp),maxEnemies,maxShots,bossSeconds:Math.round(bossSeconds),shotsFired:run.shotsFired})
  `);
  rows.push(result); console.log(JSON.stringify(result));
}
fs.mkdirSync(path.join(__dirname,'../docs/qa'),{recursive:true});
fs.writeFileSync(path.join(__dirname, process.env.PROBE_ALL ? '../docs/qa/campaign-250.json' : process.env.PROBE_SEEDS ? '../docs/qa/balance-probes-seeds.json' : '../docs/qa/balance-probes.json'), JSON.stringify(rows,null,2));
