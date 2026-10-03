const { test, expect } = require('@playwright/test');
const path = require('path');

const FILE_URL = 'file://' + path.resolve(__dirname, '../index.html').replace(/\\/g, '/');

async function boot(page, save) {
  await page.goto(FILE_URL);
  await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('prstna-dirka', JSON.stringify(s)); }, save);
  await page.goto(FILE_URL);
}

// Deterministic driver: steps the game by hand (finger follows the centreline).
async function installDriver(page) {
  await page.evaluate(() => {
    window.__drv = { spd: 420, target: null, lift: false };
    window.__step = function () {
      const d = __drv;
      if (state === 'rejoin') { const p = getFingerSlotPos(rejoinPos); pointer.x = p.x; pointer.y = p.y; pointer.down = true; }
      else if (state === 'prestart' || state === 'countdown') { const p = getFingerSlotPos(startSlot); pointer.x = p.x; pointer.y = p.y; pointer.down = true; }
      else if (state === 'racing') {
        let tx, ty;
        if (d.target) { tx = d.target.x; ty = d.target.y; const dd = Math.hypot(tx - player.x, ty - player.y); if (dd > 8) { const st = Math.min(dd, d.spd / 60); tx = player.x + (tx - player.x) / dd * st; ty = player.y + (ty - player.y) / dd * st; } }
        else { const p = posAt(wrapS(player.s + d.spd / 60), 0); tx = p.x; ty = p.y; }
        pointer.x = tx; pointer.y = ty + getFingerOffset(); pointer.down = !d.lift;
      }
      update(1 / 60);
    };
    window.__sim = function (sec, stop) {
      for (let i = 0; i < Math.round(sec * 60); i++) { if (state === 'tutpause' || state === 'finished') break; __step(); if (stop && stop()) break; }
      return { state, card: TUT.card, step: TUT.step };
    };
  });
}

test.describe('Rookie Ring tutorial track', () => {

  test('first run: OK on the welcome screen starts the tutorial on the O-track with no rivals', async ({ page }) => {
    await boot(page, { tutSeen: false, sound: false });
    await page.waitForSelector('#tutorial.on', { timeout: 15000 });
    await page.locator('#btnTutOk').click();
    await expect(page.locator('#tutCard')).toBeVisible({ timeout: 5000 });
    const info = await page.evaluate(() => ({ curTrack, racers: racers.length, tutOn: TUT.on, card: TUT.card, state }));
    expect(info).toEqual({ curTrack: 8, racers: 0, tutOn: true, card: 1, state: 'tutpause' });
    await expect(page.locator('#tutSkipPill')).toBeVisible();
  });

  test('skip turns the tutorial into a normal race with rivals', async ({ page }) => {
    await boot(page, { tutSeen: true, introSeen: true, lang: 'en', sound: false });
    await page.waitForSelector('#menu.on', { timeout: 15000 });
    await page.evaluate(() => startTutorial());
    await expect(page.locator('#tutCard')).toBeVisible({ timeout: 5000 });
    await page.locator('#tutCSkip').click();
    const info = await page.evaluate(() => ({ tutOn: TUT.on, curTrack, racers: racers.length, done: save.tutorialDone, state }));
    expect(info.tutOn).toBe(false);
    expect(info.curTrack).toBe(8);
    expect(info.racers).toBeGreaterThan(0);
    expect(info.done).toBe(true);
    expect(info.state).toBe('prestart');
    await expect(page.locator('#tutCard')).toBeHidden();
    await expect(page.locator('#tutSkipPill')).toBeHidden();
  });

  test('Rookie Ring is the first, unlocked card in Single Race even in freemium mode', async ({ page }) => {
    await boot(page, { tutSeen: true, introSeen: true, lang: 'en', sound: false, freemiumMode: true });
    await page.waitForSelector('#menu.on', { timeout: 15000 });
    await page.evaluate(() => { ttSelected = false; coneHuntSel = false; openSingle(); });
    const first = page.locator('#singleCards .wcCard').first();
    await expect(first).toContainText('Rookie Ring');
    await expect(first).not.toHaveClass(/trackCardLocked/);
  });

  test('parking lot is drivable, freezes lap progress, and Back to track returns to the ring', async ({ page }) => {
    await boot(page, { tutSeen: true, introSeen: true, lang: 'en', sound: false });
    await page.waitForSelector('#menu.on', { timeout: 15000 });
    await installDriver(page);
    const r = await page.evaluate(() => {
      skipTutorial();                       // normal race on the O-track
      __sim(6, () => state === 'racing' && raceTime > 0.5);
      const inLot = onTrack(RK.CX, RK.CY) && rkInInfield(RK.CX, RK.CY);
      // teleport the car next to the lot via the connector and drive in
      const c = { x: RK.CX - RK.R + RK.HW - 20, y: RK.CONN[0] };
      player.x = c.x; player.y = c.y;
      __drv.target = { x: RK.CX - 40, y: RK.CONN[0] };
      __sim(2, () => player._inInf);
      const s0 = player.s; __sim(0.3);
      const frozen = player._inInf && player.s === s0;
      const btn = getComputedStyle($('rkBackBtn')).display;
      $('rkBackBtn').click();
      const back = { state, sd: sdAt(player.x, player.y), inf: rkInInfield(player.x, player.y) };
      return { inLot, frozen, btn, back };
    });
    expect(r.inLot).toBe(true);
    expect(r.frozen).toBe(true);
    expect(r.btn).toBe('block');
    expect(r.back.state).toBe('rejoin');
    expect(r.back.sd).toBeGreaterThan(40);
    expect(r.back.inf).toBe(false);
  });

  test('crashing into the tutorial barrels opens the crash lesson, then the pit lesson', async ({ page }) => {
    await boot(page, { tutSeen: true, introSeen: true, lang: 'en', sound: false });
    await page.waitForSelector('#menu.on', { timeout: 15000 });
    await installDriver(page);
    const steps = await page.evaluate(() => {
      const seen = [];
      startTutorial();
      for (let k = 0; k < 12; k++) {
        if (state === 'tutpause') { seen.push(TUT.card); if (TUT.card === 6) break; tutCloseCard(); }
        __sim(12);
      }
      return { seen, dmg: player.dmg, hl: TUT.hl && TUT.hl.type };
    });
    expect(steps.seen).toEqual([2, 4, 5, 6]);
    expect(steps.dmg).toBeGreaterThan(0.6);
    await expect(page.locator('#tutCard')).toBeVisible();
    await expect(page.locator('#tutCTitle')).toContainText('Pit');
  });
});
