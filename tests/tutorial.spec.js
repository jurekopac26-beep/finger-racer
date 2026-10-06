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
    const info = await page.evaluate(() => ({
      curTrack,
      racers: racers.length,
      tutOn: TUT.on,
      card: TUT.card,
      state,
      tutObsCount: cones.filter(c => c.tutObs).length,
      hw: RK.HW,
      b: RK.B,
    }));
    expect(info.curTrack).toBe(8);
    expect(info.racers).toBe(0);
    expect(info.tutOn).toBe(true);
    expect(info.card).toBe(1);
    expect(info.state).toBe('tutpause');
    // Obstacles are visible on track at the very beginning:
    expect(info.tutObsCount).toBe(9);
    // Track is 25% wider (HW = 139):
    expect(info.hw).toBe(139);
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
      const c = { x: RK.CX - RK.W + RK.HW - 20, y: RK.CONN[0] };
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

  test('tutorial card 8 explains slipstream drafting with animation scene 8 and 11 pill indicators', async ({ page }) => {
    await boot(page, { tutSeen: true, introSeen: true, lang: 'sl', sound: false });
    await page.waitForSelector('#menu.on', { timeout: 15000 });
    const res = await page.evaluate(() => {
      startTutorial();
      tutCard(8);
      const pills = document.querySelectorAll('#tutPills i').length;
      const title = $('tutCTitle').textContent;
      const hasScene8 = !!TA_SCENES[8];
      const hasDraftScene = !!TA_SCENES.draft;
      const isAnimRunning = !!TA.raf;
      return { pills, title, hasScene8, hasDraftScene, isAnimRunning };
    });
    expect(res.pills).toBe(11);
    expect(res.title).toContain('Moč zavetrja');
    expect(res.hasScene8).toBe(true);
    expect(res.hasDraftScene).toBe(true);
    expect(res.isAnimRunning).toBe(true);
  });

  test('training step 2 dialog displays and runs slipstream draft animation', async ({ page }) => {
    await boot(page, { tutSeen: true, introSeen: true, lang: 'sl', sound: false, training: { s1: 1 } });
    await page.waitForSelector('#menu.on', { timeout: 15000 });
    const res = await page.evaluate(() => {
      openTrainInfo(2);
      const animActive = !!TA.raf;
      const sceneMatches = TA.scene === TA_SCENES[8];
      $('btnTrainInfoBack').click();
      const stoppedAfterBack = !TA.raf;
      return { animActive, sceneMatches, stoppedAfterBack };
    });
    expect(res.animActive).toBe(true);
    expect(res.sceneMatches).toBe(true);
    expect(res.stoppedAfterBack).toBe(true);
  });

  test('interactive slipstream lesson spawns waiting rival car ahead, starts moving, and heals damage in slipstream', async ({ page }) => {
    await boot(page, { tutSeen: true, introSeen: true, lang: 'sl', sound: false });
    await page.waitForSelector('#menu.on', { timeout: 15000 });
    await installDriver(page);
    const res = await page.evaluate(() => {
      startTutorial();
      state = 'racing';
      TUT.step = 7;
      player.fuel = 1;
      tutTick(1.0); // step 7 -> step 8
      tutTick(1.0); // triggers step 8 Card 8 and spawns rival
      const coachSpawned = !!TUT.coachRacer;
      const initialV = TUT.coachRacer ? TUT.coachRacer.v : -1;
      const racerCount = racers.length;
      tutCloseCard(); // user taps "Got it!"
      state = 'racing';
      pointer.down = true;
      const activeAfterClose = TUT.draftActive;
      const initialDmg = player.dmg;
      const coachVAfterClose = TUT.coachRacer ? TUT.coachRacer.v : -1;
      const hlType = TUT.hl && TUT.hl.type;

      // Position coach 50px ahead on centerline, then drive with __step
      TUT.coachRacer.s = wrapS(player.s + 50);
      const cp = posAt(TUT.coachRacer.s, 0);
      TUT.coachRacer.px = cp.x; TUT.coachRacer.py = cp.y;
      __drv.spd = 300;
      let draftingDetected = false;
      for (let i = 0; i < 220; i++) {
        TUT.coachRacer.s = wrapS(player.s + 50);
        const p2 = posAt(TUT.coachRacer.s, 0);
        TUT.coachRacer.px = p2.x; TUT.coachRacer.py = p2.y;
        __step();
        if (draftOn) draftingDetected = true;
        if (TUT.step === 9) break;
      }
      const nextStep = TUT.step;
      const healedDmg = player.dmg;
      return { coachSpawned, initialV, racerCount, activeAfterClose, initialDmg, coachVAfterClose, hlType, draftingDetected, nextStep, healedDmg };
    });
    expect(res.coachSpawned).toBe(true);
    expect(res.initialV).toBe(0);
    expect(res.racerCount).toBe(1);
    expect(res.activeAfterClose).toBe(1);
    expect(res.initialDmg).toBeGreaterThanOrEqual(0.45);
    expect(res.coachVAfterClose).toBeGreaterThan(0);
    expect(res.hlType).toBe('car');
    expect(res.draftingDetected).toBe(true);
    expect(res.nextStep).toBe(9);
    expect(res.healedDmg).toBeLessThan(res.initialDmg);
  });
});
