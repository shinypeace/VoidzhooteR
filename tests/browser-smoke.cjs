const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/pavel/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const out = path.join(__dirname, '../docs/qa');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await context.route('https://**/*', route => route.abort());
    await context.addInitScript(() => {
      localStorage.setItem('voidstorm_settings', JSON.stringify({ sfx: false, music: false, shake: false }));
      if (!localStorage.getItem('voidstorm_save')) localStorage.setItem('voidstorm_save', JSON.stringify({ version: 2, credits: 14000, campaignLevel: 19, currentShip: 3, unlockedShips: [0, 1, 2, 3], fleetUpgrades: { dmg: 3, hp: 3, rate: 2 }, daily: { last: new Date().toDateString(), streak: 2 } }));
    });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'load' });
    await page.waitForFunction(() => window.Voidstorm?.atlasReady);
    const viewportReport = await require('./viewport-browser.cjs')(page, context);
    assert(await page.locator('#toast').evaluate(el => el.classList.contains('hidden')), 'Migration must not show an entry banner');
    await page.screenshot({ path: path.join(out, '01-menu.png') });
    const menuButtons = await page.locator('#mainMenu button').allTextContents();
    assert(!menuButtons.some(t => /[\p{Extended_Pictographic}⌁≡↗∞]/u.test(t)), 'No emoji or symbolic placeholder menu buttons');
    await page.locator('#shopBtn').click();
    const closeGeometry = await page.locator('#shopMenu .close-btn').evaluate(el => {
      const r=el.getBoundingClientRect(), c=getComputedStyle(el,'::before');
      return { width:r.width, borderLeft:parseFloat(c.borderLeftWidth), borderRight:parseFloat(c.borderRightWidth), padding:getComputedStyle(el).padding };
    });
    assert(closeGeometry.borderLeft + closeGeometry.borderRight <= closeGeometry.width, 'Close frame must fit inside its button');
    assert.equal(closeGeometry.padding,'0px');
    const creditsBefore = await page.evaluate(() => Voidstorm.save.credits);
    await page.locator('#upgradeHpBtn').click();
    assert.equal(await page.evaluate(() => Voidstorm.save.credits), creditsBefore, 'Selecting an upgrade must not spend credits');
    const hpBefore = await page.evaluate(() => Voidstorm.save.upgrades[Voidstorm.save.currentShip].hp);
    const cost = await page.evaluate(() => Balance.upgradeCost(Voidstorm.save.upgrades[Voidstorm.save.currentShip].hp, Voidstorm.save.currentShip));
    await page.screenshot({ path: path.join(out, '02-upgrade-selection.png') });
    await page.locator('#buyUpgradeBtn').click();
    assert.equal(await page.evaluate(() => Voidstorm.save.credits), creditsBefore - cost);
    assert.equal(await page.evaluate(() => Voidstorm.save.upgrades[Voidstorm.save.currentShip].hp), hpBefore + 1);
    await page.reload(); await page.waitForFunction(() => Voidstorm.atlasReady);
    assert.equal(await page.evaluate(() => Voidstorm.save.upgrades[Voidstorm.save.currentShip].hp), hpBefore + 1, 'Upgrade persists after reload');
    await page.locator('#campaignBtn').click();
    assert.equal(await page.locator('.sector-btn').count(), 300);
    await page.locator('#launchSectorBtn').click();
    await page.waitForFunction(() => Voidstorm.state.active);
    const rect = await page.locator('#gameCanvas').boundingBox();
    const touch = await context.newCDPSession(page);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: rect.x + 80, y: rect.y + 660, id: 0 }] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: rect.x + 295, y: rect.y + 660, id: 0 }] });
    await page.waitForTimeout(90);
    const movement = await page.evaluate(() => ({ x: Voidstorm.player.x, targetX: Voidstorm.player.targetX }));
    assert(Math.abs(movement.x - movement.targetX) < 8, 'Touch follow must settle promptly');
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.locator('#pauseBtn').click();
    const timeBefore = await page.evaluate(() => Voidstorm.state.time);
    await page.waitForTimeout(120);
    assert.equal(await page.evaluate(() => Voidstorm.state.time), timeBefore, 'Pause freezes the simulation');
    await page.locator('#resumeBtn').click();
    await page.evaluate(() => { player.iframe = 0; player.hit(999999); });
    await page.locator('#resActionBtn').click();
    assert.equal(await page.evaluate(() => Voidstorm.state.mode), 'CAMPAIGN', 'Retry preserves campaign mode');
    assert.equal(await page.evaluate(() => Voidstorm.state.level), 19);

    // A reproducible dense battlefield, including every projectile family, for a visual/performance check.
    await page.evaluate(() => {
      startRun('CAMPAIGN', 19); run.queue = []; run.bossPending = true; run.bossSpawned = true;
      player.hp = player.maxHp = 100000; player.targetX = 300; player.targetY = 950;
      enemies = ['fighter','hunter','tank','sniper','elite','bomber','guardian'].map((type, i) => {
        const enemy = new Enemy(type, Balance.campaign(60), 60 + i * 78); enemy.y = 160 + i % 3 * 120; enemy.hp = enemy.maxHp = 100000; enemy.shoot(); return enemy;
      });
      for (const type of ['overdrive','multishot','shield']) player.boosts[type] = 30000;
      window.frameStats = []; window.lastMeasuredFrame = 0;
      function frame(t) { if (lastMeasuredFrame) frameStats.push(t - lastMeasuredFrame); lastMeasuredFrame = t; if (frameStats.length < 240) requestAnimationFrame(frame); }
      requestAnimationFrame(frame);
    });
    await page.waitForTimeout(4500);
    await page.screenshot({ path: path.join(out, '03-battle.png') });
    const performanceReport = await page.evaluate(() => {
      const sorted = frameStats.slice().sort((a,b) => a-b);
      return { frames: sorted.length, medianMs: sorted[Math.floor(sorted.length * .5)], p95Ms: sorted[Math.floor(sorted.length * .95)], over40ms: sorted.filter(v => v > 40).length, bullets: enemyBullets.length, spriteCache: Atlas.cache.size, hudChips: document.querySelectorAll('.boost-chip').length };
    });
    console.log('Browser render timings:', JSON.stringify(performanceReport));
    assert.equal(performanceReport.hudChips, 3, 'HUD chips are reused');
    assert(performanceReport.spriteCache < 220, 'Sprite cache remains bounded');
    await page.evaluate(() => {
      enemies = [new Enemy('boss', Balance.campaign(15))]; const boss = enemies[0]; boss.y = 210; boss.age = 11000; boss.hp = boss.maxHp * .30; boss.update(16.67); boss.summon(); boss.shoot();
    });
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(out, '04-boss.png') });
    assert(await page.evaluate(() => enemies.some(e => e.escort)), 'Boss summons escorts');
    for (const size of [{ width: 360, height: 640 }, { width: 320, height: 568 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(size); await page.evaluate(() => showMenu());
      const fit = await page.evaluate(() => {
        const container = document.getElementById('gameContainer').getBoundingClientRect();
        return [...document.querySelectorAll('#mainMenu button')].every(el => { const r = el.getBoundingClientRect(); return r.top >= container.top && r.bottom <= container.bottom && r.left >= container.left && r.right <= container.right; });
      });
      assert(fit, `All menu buttons fit at ${size.width}x${size.height}`);
      await page.screenshot({ path: path.join(out, `menu-${size.width}.png`) });
    }
    // A funded sector-1 profile can buy any hull and upgrade it without prerequisites.
    await page.evaluate(() => {
      showMenu(); Save.data = Balance.freshSave();
      Save.data.credits = SHIPS[11].cost + Balance.upgradeCost(1, 11);
      shopIndex = 11; renderShop(); openPanel('shopMenu');
    });
    await page.locator('#buyShipBtn').click();
    assert.equal(await page.evaluate(() => Save.data.currentShip), 11);
    assert.equal(await page.evaluate(() => Save.data.campaignLevel), 1);
    await page.locator('#upgradeHpBtn').click(); await page.locator('#buyUpgradeBtn').click();
    assert.equal(await page.evaluate(() => Save.data.upgrades[11].hp), 2);
    assert.equal(await page.evaluate(() => Save.data.credits), 0);
    const barWidths = await page.evaluate(() => SHIPS.map(s => {
      shopIndex = s.id; renderShop();
      return ['statBarDmg','statBarArmor','statBarSpeed'].map(id => parseFloat($(id).style.width));
    }));
    for (let i=1;i<barWidths.length;i++) for(let j=0;j<3;j++) assert(barWidths[i][j]>barWidths[i-1][j]);
    await page.evaluate(() => {
      const gallery=document.createElement('canvas');gallery.id='artReview';gallery.width=1100;gallery.height=1180;
      gallery.style.cssText='position:fixed;left:0;top:0;z-index:999;width:1100px;height:1180px';document.body.append(gallery);
      const c=gallery.getContext('2d');c.fillStyle='#071321';c.fillRect(0,0,1100,1180);c.textAlign='center';c.font='bold 15px sans-serif';
      Balance.BOSSES.forEach((b,i)=>{const x=110+i%5*220,y=90+Math.floor(i/5)*220;Atlas.draw(c,b.sprite,x,y,165,Math.PI);c.fillStyle='#bceaff';c.fillText(b.name,x,y+103)});
      Object.entries(ENEMIES).filter(([key])=>key!=='boss').forEach(([key,e],i)=>{const x=90+i%7*150,y=730+Math.floor(i/7)*112;Atlas.draw(c,e.sprite,x,y,77,Math.PI);c.fillStyle='#a9bfd3';c.font='12px sans-serif';c.fillText(e.name+' / '+e.unlock,x,y+47)});
    });
    await page.setViewportSize({width:1100,height:1180});
    await page.locator('#artReview').screenshot({path:path.join(out,'05-fleet-and-bosses.png')});
    if (errors.length) console.log('Browser exceptions:', JSON.stringify(errors));
    assert.deepEqual(errors, [], 'No browser exceptions');
    fs.writeFileSync(path.join(out, 'browser-report.json'), JSON.stringify({ ok: true, errors, viewport: viewportReport, performance: performanceReport, viewports: ['390x844', '360x640', '320x568', '1440x900'] }, null, 2));
    console.log('Browser smoke checks passed. Screenshots: docs/qa');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
