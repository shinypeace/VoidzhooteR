const test=require('node:test'), assert=require('node:assert/strict');
const {runtime}=require('./runtime.cjs');
function flight(level=300) { const r=runtime();r.run(`Save.data.campaignLevel=300;Save.data.unlockedShips=SHIPS.map(s=>s.id);Save.data.currentShip=Balance.campaign(${level}).tier;startRun('CAMPAIGN',${level})`);return r; }
test('only a damaging hit vibrates, disabled setting and invulnerability suppress it',()=>{
  const r=flight();r.run('var vibrations=[];window.navigator={vibrate:n=>{vibrations.push(n);return true}};player.iframe=0;player.hit(1);player.hit(1)');
  assert.equal(r.run('vibrations.length'),1);
  r.elements.get('vibrationToggle').onchange({target:{checked:false}});r.run('player.iframe=0;player.hit(1)');
  assert.equal(r.run('vibrations.length'),1);assert.equal(JSON.parse(r.storage.get('voidstorm_settings')).vibration,false);
});
test('VK haptic fallback is asynchronous and errors never interrupt damage',async()=>{
  const r=flight();r.run("var hapticCalls=[];VKAds.ready=true;window.vkBridge={supports:m=>m==='VKWebAppTapticImpactOccurred',send:async(m,p)=>{hapticCalls.push([m,p]);throw Error('unsupported')}};player.iframe=0;player.hit(1)");
  await new Promise(resolve=>setImmediate(resolve));assert.equal(r.run('hapticCalls.length'),1);assert.equal(r.run('hapticCalls[0][1].style'),'medium');
});
test('beam has a full warning interval, fixed lane, expiry, pause safety and cap',()=>{
  const r=flight();r.run("hazards=[];addHazard('beam',player.x,100,run.config);var beam=hazards[0];player.iframe=0;var initialHp=player.hp;beam.update(1000)");assert.equal(r.run('player.hp'),r.run('initialHp'));
  r.run('pauseGame();simulate(1000)');assert.equal(r.run('beam.age'),1000);r.run('resumeGame();beam.update(120)');assert(r.run('player.hp')<r.run('initialHp'));
  r.run("for(let i=0;i<10;i++)addHazard('beam',100+i*20,100,run.config)");assert.equal(r.run('hazards.length'),2);
  r.run('beam.update(800)');assert.equal(r.run('beam.active'),false);
});
test('debris is destructible, gives no income, and boss defeat clears all hazards',()=>{
  const r=flight();r.run("var income=run.credits;addHazard('rock',300,400,run.config);hazards[0].hit(1e12)");assert(!r.run('hazards[0].active'));assert.equal(r.run('run.credits'),r.run('income'));
  r.run("addHazard('pylon',100,250,run.config);new Enemy('boss',run.config).hit(1e12)");assert.equal(r.run('hazards.length'),0);
});
test('three new bosses deploy different obstacle mechanics and all shots stay bounded',()=>{
  const r=flight(), kinds=[];
  for(const kind of [10,11,12]) {
    kinds.push(r.run(`hazards=[];enemyBullets=[];var boss=new Enemy('boss',{...run.config,bossKind:${kind}});boss.y=200;for(let i=0;i<12;i++)boss.shoot();[...new Set(hazards.map(h=>h.kind))].sort().join(',')`));
    assert(r.run('hazards.length')<=6);assert(r.run('enemyBullets.length')<=r.run('run.config.bulletCap'));
  }
  assert.deepEqual(kinds,['beam','rock','beam,pylon']);
});
test('new enemy mechanics curve, split and create a capped debris field',()=>{
  const r=flight();r.run("var e=new Enemy('resonator',run.config);e.y=200;e.shoot();var b=enemyBullets[0],vx=b.vx;b.update(100)");assert.notEqual(r.run('b.vx'),r.run('vx'));
  r.run("enemyBullets=[];e=new Enemy('rift',run.config);e.y=200;e.shoot()");assert(r.run('enemyBullets[0].split'));
  r.run("e=new Enemy('warden',run.config);e.y=200;for(let i=0;i<40;i++)e.shoot()");assert(r.run('hazards.length')>0 && r.run('hazards.length')<=6);
});
test('survival anchor follows profile progression and ignores selected hull strength',()=>{
  const r=flight();r.run("Save.data.campaignLevel=54;Save.data.currentShip=0;startRun('ENDLESS');var power=run.config.expectedDps;run.wave=30;Director.beginWave()");
  assert.equal(r.run('run.survivalStart'),54);assert.equal(r.run('power'),r.run('Balance.campaign(54).expectedDps'));assert(r.run('run.config.expectedDps')>r.run('power'));
});
test('selecting an upgrade preserves hangar DOM and does not affect another hull',()=>{
  const r=flight();r.run('showMenu();shopIndex=0;Save.data.credits=10000;renderShop()');const dots=r.elements.get('shipDots').children;
  r.elements.get('upgradeHpBtn').onclick();assert.equal(r.elements.get('shipDots').children,dots);
  r.elements.get('buyUpgradeBtn').onclick();assert.equal(r.run('Save.data.upgrades[0].hp'),2);assert.equal(r.run('Balance.upgradesFor(Save.data,1).hp'),1);
});
