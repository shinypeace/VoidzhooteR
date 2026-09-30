const test = require('node:test');
const assert = require('node:assert/strict');
const { runtime } = require('./runtime.cjs');
function game() { const r = runtime(); r.run("Save.data.campaignLevel = 250; startRun('CAMPAIGN', 19);"); return r; }
test('touch movement is absolute above the finger and settles within 5 pixels in 83ms', () => {
  const r = game();
  r.run("input.pointer = 1; pointerMove({pointerType:'touch',pointerId:1,clientX:520,clientY:800}); for(let i=0;i<5;i++) player.update(STEP);");
  assert.equal(r.run('player.targetY'), 720); assert.equal(r.run('player.targetX'), 520);
  assert(Math.abs(r.run('player.x') - 520) < 5);
});
test('all enemies fire distinct projectile families; targeting lines are absent', () => {
  const r = game(); const styles = [];
  for (const type of ['drone','scout','fighter','hunter','tank','sniper','elite','bomber','guardian']) {
    const value = r.run(`enemyBullets = []; var e = new Enemy('${type}', Balance.campaign(40)); e.y=200; e.shoot(); ({count:enemyBullets.length, style:enemyBullets[0].style, warning: 'warning' in e})`);
    assert(value.count >= 1); assert.equal(value.warning, false); styles.push(value.style);
  }
  assert.equal(new Set(styles).size, 9);
});
test('snipers leave the firing perch; shot cooldown cannot reset lifetime', () => {
  const r = game(); r.run("var sniper = new Enemy('sniper', run.config); for (let t=0;t<19000;t+=STEP) sniper.update(STEP);");
  assert.equal(r.run('sniper.active'), false); assert(r.run('sniper.y') > 1000);
});
test('boss has three phases, moving position, frequent patterns and bounded escorts', () => {
  const r = game();
  r.run("enemies = [new Enemy('boss', Balance.campaign(15))]; var boss = enemies[0]; boss.y=200; boss.age=6000; boss.update(STEP); boss.summon();");
  assert(r.run('enemies.some(e => e.escort)')); assert(r.run('enemies.length') <= 4);
  const x1 = r.run('boss.x'); r.run('boss.age += 1000; boss.update(STEP)'); assert.notEqual(r.run('boss.x'), x1);
  for (const [hp, expected] of [[.9,0],[.5,1],[.2,2]]) { r.run(`boss.hp=boss.maxHp*${hp};boss.update(STEP)`); assert.equal(r.run('boss.bossPhase'), expected); }
  r.run('for(let i=0;i<30;i++) {boss.shoot();boss.summon()}');
  assert(r.run('enemyBullets.length') <= r.run('boss.config.bulletCap')); assert(r.run('enemies.filter(e=>e.escort).length') <= 3);
  r.run('boss.hit(1e9)'); assert.equal(r.run('enemyBullets.length'), 0); assert.equal(r.run('enemies.some(e=>e.escort && e.active)'), false);
});
test('selecting a system is free; separate purchase deducts exactly once and rank cap applies', () => {
  const r = game(); r.run('showMenu(); Save.data.credits=5000; renderShop();');
  r.elements.get('upgradeHpBtn').onclick(); assert.equal(r.run('Save.data.credits'), 5000); assert.equal(r.run('Save.data.fleetUpgrades.hp'), 1);
  r.elements.get('buyUpgradeBtn').onclick(); assert.equal(r.run('Save.data.credits'), 4800); assert.equal(r.run('Save.data.fleetUpgrades.hp'), 2);
  r.run('Save.data.fleetUpgrades.hp=MAX_UPGRADE;renderShop()'); assert(r.elements.get('buyUpgradeBtn').disabled);
  r.elements.get('buyUpgradeBtn').onclick(); assert.equal(r.run('Save.data.credits'), 4800);
});
test('paused simulation does not move, shoot, or advance any timers', () => {
  const r = game(); r.run('simulate(1000); pauseGame()');
  const before = r.run('JSON.stringify([run.time,player.x,player.y,player.shotTimer,enemies.length,enemyBullets.length])');
  r.run('for(let i=0;i<120;i++) advance(STEP)');
  assert.equal(r.run('JSON.stringify([run.time,player.x,player.y,player.shotTimer,enemies.length,enemyBullets.length])'), before);
});
test('fixed timestep preserves movement and fire at 30, 60 and 144 Hz', () => {
  const results = [];
  for (const fps of [30,60,144]) {
    const r = game();
    results.push(r.run(`run.queue=[];run.bossPending=true;run.bossSpawned=true;player.targetX=520;for(let i=0;i<${fps * 4};i++) advance(1000/${fps}); [run.time, player.x, bullets.length]`));
  }
  for (const result of results) { assert(Math.abs(result[0] - results[0][0]) <= 17); assert(Math.abs(result[1] - 520) < .01); assert(Math.abs(result[2] - results[0][2]) <= 1); }
});
test('run income is banked once across wave breaks, pagehide, defeat and retry', () => {
  const r = game(); const initial = r.run('Save.data.credits');
  r.run('run.credits=250;bankIncome();bankIncome()'); assert.equal(r.run('Save.data.credits'), initial + 250);
  r.listeners.pagehide(); assert.equal(r.run('run.committed'), false); assert.equal(r.run('Save.data.credits'), initial + 250);
  r.run('resumeGame();run.credits=390;finishRun(false);finishRun(false)'); assert.equal(r.run('Save.data.credits'), initial + 390);
  r.elements.get('resActionBtn').onclick(); assert.equal(r.run('run.mode'), 'CAMPAIGN'); assert.equal(r.run('run.level'), 19);
});
test('finite campaigns complete once; bosses are required; coverage cannot be farmed using escorts', () => {
  const r = game();
  r.run('run.wave=run.config.waves;run.queue=[];enemies=[];run.planned=20;run.regularKills=15;run.bossPending=false;Director.update(STEP)');
  assert.equal(r.run('run.active'), false); assert(r.run('Save.data.levelBest[19]') >= 0);
  r.run("startRun('CAMPAIGN',15);run.wave=3;run.queue=[];enemies=[];run.bossPending=true;run.bossSpawned=false;Director.update(STEP)");
  assert.equal(r.run('run.active'), true); assert.equal(r.run('enemies[0].type'), 'boss');
  r.run("var escort=new Enemy('fighter',run.config,100,true);escort.hit(1e6)"); assert.equal(r.run('run.regularKills'), 0);
});
test('late survival maintains population, bullets, particles and pickup bounds over repeated waves', () => {
  const r = game();
  const result = r.run(`
    startRun('ENDLESS');run.wave=75;Director.beginWave();player.hp=player.maxHp=1e7;
    var maxPopulation=0,maxProjectiles=0,limitViolation=false;
    for(let tick=0;tick<60*600 && run.active && run.wave<85;tick++) {
      for(const e of enemies) {
        if(e.type==='boss') { if(e.age>18000)e.hit(1e8);else if(e.age>11000)e.hp=Math.min(e.hp,e.maxHp*.30);else if(e.age>7000)e.hp=Math.min(e.hp,e.maxHp*.6); }
        else if(e.age>5000)e.hit(1e8);
      }
      simulate(STEP);
      maxPopulation=Math.max(maxPopulation,enemies.length);maxProjectiles=Math.max(maxProjectiles,enemyBullets.length);
      if(enemies.length>run.config.maxEnemies || enemyBullets.length>run.config.bulletCap || particles.length>220 || pickups.length>5 || bullets.length>170)limitViolation=true;
    }
    ({wave:run.wave,maxPopulation,maxProjectiles,limitViolation})
  `);
  assert.equal(result.limitViolation, false); assert(result.wave >= 85); assert(result.maxProjectiles > 30);
});
test('choosing an unaffordable system remains possible without enabling purchase', () => {
  const r = game(); r.run('showMenu();Save.data.credits=0;renderShop()');
  r.elements.get('upgradeRateBtn').onclick();
  assert.equal(r.elements.get('upgradeRateBtn').disabled, false); assert.equal(r.elements.get('buyUpgradeBtn').disabled, true);
  assert.equal(r.run('Save.data.fleetUpgrades.rate'), 1); assert.equal(r.run('Save.data.credits'), 0);
});
