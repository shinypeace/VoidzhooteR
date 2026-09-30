const test = require('node:test');
const assert = require('node:assert/strict');
const { runtime } = require('./runtime.cjs');
const B = require('../js/balance.js');
const { model } = require('./economy.cjs');
function flight(level = 110) {
  const r = runtime(); r.run(`Save.data.campaignLevel=250;Save.data.currentShip=5;startRun('CAMPAIGN',${level})`); return r;
}
test('rest freezes timed modules and supplies arrive far away with the next wave', () => {
  const r = flight();
  r.run("player.boosts.overdrive=7000; run.queue=[];enemies=[];run.bossPending=false;Director.update(STEP)");
  assert.equal(r.run('run.phase'), 'rest'); assert.equal(r.run('pickups.length'), 0);
  r.run('for(let i=0;i<120;i++) simulate(STEP)');
  assert.equal(r.run('player.boosts.overdrive'), 7000);
  assert.equal(r.run('bullets.length'), 0);
  r.run('Director.beginWave()');
  assert(r.run('Math.hypot(pickups[0].x-player.x,pickups[0].y-player.y)') > 700);
  r.run('simulate(STEP)'); assert(r.run('player.boosts.overdrive') < 7000);
});
test('homing is a 25% support weapon and cannot capture side/behind targets', () => {
  const r = flight(); r.run('bullets=[];player.shoot()');
  assert(Math.abs(r.run('bullets.filter(b=>b.homing).reduce((n,b)=>n+b.damage,0)/bullets.reduce((n,b)=>n+b.damage,0)') - .25) < .0001);
  r.run("enemies=[new Enemy('drone',run.config,560)];enemies[0].y=600; var missile=new Bullet(300,900,0,-740,1,'white',{homing:true});missile.update(STEP)");
  assert.equal(r.run('missile.vx'), 0);
  r.run('enemies[0].x=330;missile.update(STEP)'); assert(r.run('missile.vx') > 0);
  r.run('for(let i=0;i<40;i++)missile.update(STEP)'); assert(Math.abs(r.run('Math.atan2(missile.vx,-missile.vy)')) <= .301);
});
test('fire-rate ranks increase sustained damage without changing movement or damage per volley', () => {
  for (const ship of B.SHIPS) {
    const a = B.stats(ship.id, { dmg: 1, hp: 1, rate: 1 }), b = B.stats(ship.id, { dmg: 1, hp: 1, rate: 20 });
    assert(b.interval < a.interval); assert(b.dps > a.dps); assert.equal(a.speed, b.speed);
    assert(Math.abs(a.dps * a.interval - b.dps * b.interval) < .001);
  }
  assert.equal(B.migrate({ version:3, fleetUpgrades:{spd:9}, campaignLevel:120, completed:true }).fleetUpgrades.rate, 9);
  const migrated = B.migrate({ version:3, campaignLevel:120, completed:true }); assert.equal(migrated.campaignLevel,121); assert.equal(migrated.completed,false);
});
test('each hull delivers higher sustained DPS to a narrow target, including the flagship', () => {
  const measured = [];
  for (const ship of B.SHIPS) {
    const r=flight();
    measured.push(r.run(`Save.data.currentShip=${ship.id};player=new Player();run.queue=[];run.bossPending=true;run.bossSpawned=true;
      enemies=[new Enemy('scout',run.config,300)];var target=enemies[0];target.y=300;target.radius=19;target.hp=target.maxHp=1e8;target.speed=0;target.update=()=>{};
      for(let i=0;i<120;i++)simulate(STEP);var hpStart=target.hp;for(let i=0;i<1200;i++)simulate(STEP);(hpStart-target.hp)/20`));
  }
  for(let i=1;i<measured.length;i++)assert(measured[i]>measured[i-1],`hull ${i}: ${measured}`);
});
test('central hull ellipse catches body edge and swept shots, with wing graze allowed', () => {
  const r=flight();
  assert(r.run('hitsPlayer({prevX:player.x+19,x:player.x+19,prevY:player.y,y:player.y,width:4})'));
  assert(!r.run('hitsPlayer({prevX:player.x+35,x:player.x+35,prevY:player.y,y:player.y,width:4})'));
  assert(r.run('hitsPlayer({prevX:player.x,x:player.x,prevY:player.y-100,y:player.y+100,width:4})'));
});
test('all 23 enemy types shoot, move, resolve, and all 10 boss patterns differ', () => {
  assert.equal(Object.keys(B.ENEMIES).length-1,23);
  const r=flight(250), patterns=[];
  for (const type of Object.keys(B.ENEMIES).filter(t=>t!=='boss')) {
    r.run(`enemyBullets=[];var e=new Enemy('${type}',Balance.campaign(250));e.y=200;e.shoot()`);
    assert(r.run('enemyBullets.length')>0,type);
    r.run('for(let i=0;i<1200;i++)e.update(STEP)'); assert.equal(r.run('e.active'),false,type);
  }
  for (let kind=0;kind<10;kind++) {
    patterns.push(r.run(`enemyBullets=[];var boss=new Enemy('boss',{...Balance.campaign(250),bossKind:${kind}});boss.y=200;boss.age=2400;boss.update(STEP);for(let n=0;n<4;n++)boss.shoot();JSON.stringify(enemyBullets.map(b=>[b.style,Math.round(b.vx),Math.round(b.vy)]))`));
    assert(r.run('enemyBullets.length')>0); assert.equal(r.run('boss.def.sprite'),106+kind);
  }
  assert.equal(new Set(patterns).size,10);
});
test('boss escorts cannot produce an infinite credit farm', () => {
  const r=flight();r.run("var before=run.credits;for(let i=0;i<50;i++)new Enemy('hunter',run.config,100,true).hit(1e9)");
  assert.equal(r.run('run.credits'),r.run('before')); assert.equal(r.run('run.regularKills'),0);
});
test('late formations cannot stack more than three heavy batteries', () => {
  const c=B.campaign(250), alive=[{type:'tank'},{type:'guardian'},{type:'minelayer'}];
  assert.equal(B.canSpawn('elite',alive,c),false);
  assert.equal(B.canSpawn('drone',alive,c),true);
});
test('first-clear economy supports every hull milestone even at 60% coverage', () => {
  const m=model(.6); assert.equal(m.hull,9); assert(m.credits>=0);
  for(const key of ['dmg','hp','rate']) assert.equal(m.ranks[key],20);
  m.purchases.forEach((p,i)=>assert.equal(p.level,B.SHIPS[i+1].unlock));
  assert(m.rows.every(r=>r.credits>=0));
  assert(m.rows.every(r=>Math.min(...Object.values(r.ranks))>=B.rankAt(r.level)-2));
});
test('ship blueprint gates purchases while previously owned ships stay available', () => {
  const r=flight();r.run('showMenu();Save.data.campaignLevel=19;Save.data.credits=1e7;shopIndex=9;renderShop()');
  assert(r.elements.get('buyShipBtn').disabled);r.elements.get('buyShipBtn').onclick();assert(!r.run('Save.data.unlockedShips.includes(9)'));
  r.run('Save.data.unlockedShips.push(9);renderShop()');r.elements.get('selectShipBtn').onclick();assert.equal(r.run('Save.data.currentShip'),9);
});
test('VK banner initializes even when user info fails; restore subscription still exists', async () => {
  const r=runtime();r.run("var calls=[];window.vkBridge={send:async(method,params)=>{calls.push([method,params]);if(method==='VKWebAppGetUserInfo')throw Error('offline');return {result:true}},subscribe:fn=>window.vkEvents=fn}");
  await r.run('VK.init()');
  assert(r.run("calls.some(c=>c[0]==='VKWebAppShowBannerAd' && c[1].banner_location==='bottom' && c[1].can_close===false)"));
  assert(r.run('VKAds.ready && typeof vkEvents === "function"'));
});
test('VK interstitial every third eligible flight, cooldown, no active-combat show or double launch', async () => {
  const r=runtime();r.run("var calls=[];window.vkBridge={send:async(method,params)=>{calls.push([method,params]);return {result:true}},supports:()=>false};VKAds.ready=true;VKAds.bannerVisible=true;VKAds.lastBannerAttempt=Date.now()");
  await r.run('VKAds.afterFlight(60000)');await r.run('VKAds.afterFlight(60000)');assert.equal(r.run('calls.length'),0);
  await r.run('VKAds.afterFlight(60000)');assert.equal(r.run("calls.filter(c=>c[0]==='VKWebAppShowNativeAds').length"),1);
  assert.equal(r.run("calls[0][1].ad_format"),'interstitial');
  for(let i=0;i<4;i++)await r.run('VKAds.afterFlight(60000)');assert.equal(r.run('calls.length'),1);
  r.run('VKAds.lastAd=0;run.active=true');await r.run('VKAds.afterFlight(60000)');assert.equal(r.run('calls.length'),1);
});
test('VK legacy interstitial falls back only for unsupported-client errors', async () => {
  const r=runtime();r.run("var calls=[];window.vkBridge={send:async(method)=>{calls.push(method);if(method==='VKWebAppShowInterstitialAd')throw {error_data:{error_code:4}};return {result:true}},supports:()=>true};VKAds.ready=true;VKAds.flights=2;VKAds.bannerVisible=true;VKAds.lastBannerAttempt=Date.now()");
  await r.run('VKAds.afterFlight(60000)');assert.equal(r.run("calls.join(',')"),'VKWebAppShowInterstitialAd,VKWebAppShowNativeAds');assert.equal(r.run('VKAds.busy'),false);
});
test('flight completion saves credits before asking VK for an ad', async () => {
  const r=flight();
  r.run("var creditAtRequest=0;window.vkBridge={supports:()=>false,send:async()=>{creditAtRequest=Save.data.credits;return {result:true}}};VKAds.ready=true;VKAds.flights=2;VKAds.bannerVisible=true;VKAds.lastBannerAttempt=Date.now();run.time=60000;run.credits=777;finishRun(false)");
  await new Promise(resolve=>setImmediate(resolve));assert.equal(r.run('creditAtRequest'),777);assert.equal(r.run('run.active'),false);assert.equal(r.run('VKAds.busy'),false);
});
