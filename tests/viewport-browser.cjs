const assert = require('node:assert/strict');

module.exports = async function viewportChecks(page, context) {
  const touch = await context.newCDPSession(page);
  const metrics = () => page.evaluate(() => ({
    scale: visualViewport.scale, x: scrollX, y: scrollY,
    offsetX: visualViewport.offsetLeft, offsetY: visualViewport.offsetTop
  }));
  const fixed = async () => {
    const m = await metrics();
    assert(Math.abs(m.scale - 1) < .001, 'Pinch/double tap must not zoom the viewport');
    assert.equal(m.x, 0); assert.equal(m.y, 0);
    assert.equal(m.offsetX, 0); assert.equal(m.offsetY, 0);
  };
  const swipe = async (x, from, to) => {
    await touch.send('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[{x,y:from,id:0}]});
    for (let step=1;step<=10;step++) {
      await touch.send('Input.dispatchTouchEvent', {type:'touchMove',touchPoints:[{x,y:from+(to-from)*step/10,id:0}]});
      await page.waitForTimeout(16);
    }
    await touch.send('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]});
    await page.waitForTimeout(150);
  };
  const pinch = async (x, y) => {
    await touch.send('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[{x:x-25,y,id:0},{x:x+25,y,id:1}]});
    for (let step=1;step<=8;step++) {
      await touch.send('Input.dispatchTouchEvent', {type:'touchMove',touchPoints:[{x:x-25-step*10,y:y-step*5,id:0},{x:x+25+step*10,y:y+step*5,id:1}]});
      await page.waitForTimeout(16);
    }
    await touch.send('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]});
    await page.waitForTimeout(100);
    await fixed();
  };

  await swipe(190, 340, 130);
  await pinch(190, 230);
  await page.locator('h1').dblclick();
  const title = await page.locator('h1').boundingBox();
  await page.mouse.move(title.x+8,title.y+15); await page.mouse.down();
  await page.mouse.move(title.x+title.width-8,title.y+40,{steps:12}); await page.mouse.up();
  assert.equal(await page.evaluate(() => getSelection().toString()), '', 'Dragging text must not select it');
  await page.keyboard.down('Control'); await page.mouse.wheel(0,-600); await page.keyboard.up('Control');
  await page.evaluate(() => window.scrollTo(0, 200));
  await fixed();

  await page.locator('#campaignBtn').click();
  const scroll = page.locator('#sectorMenu .scroll-area');
  assert(await scroll.evaluate(el => el.scrollHeight > el.clientHeight), 'Sector list should overflow internally');
  await swipe(170,650,260);
  assert(await scroll.evaluate(el => el.scrollTop > 50), 'A single finger must scroll the sector list');
  await fixed();
  await pinch(190,350);
  await scroll.evaluate(el => { el.scrollTop=0; });
  await swipe(170,260,650);
  assert.equal(await scroll.evaluate(el => el.scrollTop),0,'Top boundary must not bounce the document');
  await scroll.evaluate(el => { el.scrollTop=el.scrollHeight; });
  await swipe(170,650,260);
  await fixed();
  await scroll.evaluate(el => { el.scrollTop=0; });
  await page.mouse.move(170,400); await page.mouse.wheel(0,350);
  await page.waitForFunction(() => document.querySelector('#sectorMenu .scroll-area').scrollTop > 50);
  await fixed();
  await page.locator('#sectorMenu .close-btn').click();

  await page.locator('#settingsBtn').click();
  const toggle = page.locator('#vibrationToggle');
  const before = await toggle.isChecked(); await toggle.tap();
  assert.equal(await toggle.isChecked(),!before,'Gesture guards must preserve settings taps');
  await toggle.tap(); await page.locator('#settingsModal .close-btn').click();

  // Safari-specific events cannot be emitted natively by Chromium; check cancellation separately.
  const guards = await page.evaluate(() => ['gesturestart','gesturechange','gestureend','selectstart','contextmenu','dragstart'].map(type => {
    const event=new Event(type,{bubbles:true,cancelable:true});
    document.querySelector('h1').dispatchEvent(event); return event.defaultPrevented;
  }));
  assert(guards.every(Boolean),'WebView fallback guards must cancel browser gestures');
  await fixed();
  return {pageFixed:true,pinchBlocked:true,doubleTapBlocked:true,textSelectionBlocked:true,menuTouchScroll:true,menuWheelScroll:true,boundaryContainment:true,settingsTaps:true,safariEventGuards:true};
};
