const { test, expect } = require('@playwright/test');
const path = require('path');

const FILE_URL = 'file://' + path.resolve(__dirname, '../index.html').replace(/\\/g, '/');

test.describe('Competitive AI, Easy/Hard Modes & Track Progression', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(FILE_URL);
    await page.evaluate(() => {
      localStorage.clear();
      const s = {
        tutSeen: true,
        introSeen: true,
        lang: 'en',
        sound: false,
        diffMode: 'easy',
        diff: 0
      };
      localStorage.setItem('prstna-dirka', JSON.stringify(s));
    });
    await page.goto(FILE_URL);
    await page.waitForSelector('#menu.on', { timeout: 10000 });
  });

  test('Settings modal displays Easy and Hard (default) difficulty options and allows toggling', async ({ page }) => {
    await page.evaluate(() => {
      openSettings();
    });

    const diffOpts = page.locator('#diffOpts .setOpt');
    await expect(diffOpts).toHaveCount(2);

    // Hard is the default, even over an old saved 'easy' the player never picked
    const easyOpt = diffOpts.first();
    const hardOpt = diffOpts.nth(1);
    await expect(hardOpt).toHaveClass(/sel/);
    await expect(hardOpt).toContainText('Hard');
    await expect(easyOpt).not.toHaveClass(/sel/);
    await expect(easyOpt).toContainText('Easy');

    // Click Easy option: the choice sticks across a reload
    await easyOpt.click();
    await expect(easyOpt).toHaveClass(/sel/);
    await expect(hardOpt).not.toHaveClass(/sel/);
    expect(await page.evaluate(() => [save.diffMode, save.diffPicked])).toEqual(['easy', true]);

    await page.reload();
    await page.waitForSelector('#menu.on', { timeout: 10000 });
    expect(await page.evaluate(() => save.diffMode)).toBe('easy');
  });

  test('Hard mode lead car runs around World Record pace while Easy mode is competitive but beatable', async ({ page }) => {
    const data = await page.evaluate(() => {
      return {
        hardSkills: getCompetitiveSkills(3, 5, 'hard'),
        easySkills: getCompetitiveSkills(3, 5, 'easy')
      };
    });

    // Hard mode lead car is around WR pace (~2.40 - 2.50)
    expect(data.hardSkills[0]).toBeGreaterThan(2.40);
    expect(data.hardSkills[2]).toBeGreaterThan(2.24);

    // Easy mode lead car is competitive (~2.20 - 2.28)
    expect(data.easySkills[0]).toBeGreaterThan(2.18);
    expect(data.easySkills[0]).toBeLessThan(2.32);

    // Hard mode is strictly faster than Easy mode
    expect(data.hardSkills[0]).toBeGreaterThan(data.easySkills[0]);
    expect(data.hardSkills[2]).toBeGreaterThan(data.easySkills[2]);
  });

  test('getCompetitiveSkills includes organic randomization between calls', async ({ page }) => {
    const runs = await page.evaluate(() => {
      const r1 = getCompetitiveSkills(3, 5);
      const r2 = getCompetitiveSkills(3, 5);
      const r3 = getCompetitiveSkills(3, 5);
      return { r1, r2, r3 };
    });

    // Verify that consecutive calls are not completely identical
    const isDifferent = (runs.r1[0] !== runs.r2[0]) || (runs.r2[0] !== runs.r3[0]);
    expect(isDifferent).toBe(true);
  });

  test('Starting a race applies competitive skills to racers based on current mode', async ({ page }) => {
    const easyData = await page.evaluate(() => {
      save.diffMode = 'easy';
      startSingle(3);
      return {
        leadSkill: aiParams.SKILLS[0],
        racersCount: racers.length,
        leadRacerSpeed: racers[0].v
      };
    });

    expect(easyData.racersCount).toBe(5);
    expect(easyData.leadSkill).toBeGreaterThan(2.18);
    expect(easyData.leadRacerSpeed).toBeGreaterThan(1500);

    const hardData = await page.evaluate(() => {
      save.diffMode = 'hard';
      startSingle(3);
      return {
        leadSkill: aiParams.SKILLS[0],
        leadRacerSpeed: racers[0].v,
        wrCar: racers[0].wrCar,
        estTime: aiLeadTimeEst(aiParams.SKILLS[0], 6, true),
        wr: wrTime(4)
      };
    });

    // Hard: the leader is tuned to the track's world record (5-lap Single Race), its service stop included
    expect(hardData.wrCar).toBe(true);
    expect(hardData.estTime / hardData.wr).toBeGreaterThan(0.95);
    expect(hardData.estTime / hardData.wr).toBeLessThan(1.05);
    expect(hardData.leadRacerSpeed).toBeGreaterThan(easyData.leadRacerSpeed);
  });

  test('Career follows the difficulty: Hard runs the record, Easy keeps the level ramp', async ({ page }) => {
    const data = await page.evaluate(() => {
      window.isFreemiumActive = () => false;
      save.diffMode = 'easy'; save.diff = 0;
      startCareer(5);
      const easy = { speed: racers[0].v, wrCar: racers[0].wrCar };
      save.diffMode = 'hard'; save.diff = 1;
      startCareer(5);
      return { easy, hard: { speed: racers[0].v, wrCar: racers[0].wrCar, ratio: aiLeadTimeEst(aiParams.SKILLS[0], 6, true) / wrTime(curTrack + 1) } };
    });
    expect(data.easy.wrCar).toBe(false);
    expect(data.hard.wrCar).toBe(true);
    expect(data.hard.ratio).toBeGreaterThan(0.95);
    expect(data.hard.ratio).toBeLessThan(1.05);
    expect(data.hard.speed).toBeGreaterThan(data.easy.speed * 1.5);
  });
  test('Hard cars race like a player: they wear, pit once and repair', async ({ page }) => {
    const r = await page.evaluate(async () => {
      save.diffMode = 'hard'; save.diff = 1;
      startSingle(0); await new Promise(res => setTimeout(res, 400));
      if (state !== 'racing') beginRace(); window.__noLoop = true;
      for (let i = 0; i < 90 * 60 && !racers.every(rc => rc.finished); i++) update(1 / 60);
      return { wr: wrTime(1), lead: racers[0].finishTime, pits: racers.map(rc => rc.pits || 0), rep: racers.map(rc => (rc.repPit || 0) + (rc.repDraft || 0)) };
    });
    expect(r.pits.filter(p => p >= 1).length).toBeGreaterThanOrEqual(3);   // most of the field services
    expect(r.rep.every(x => x > 0)).toBe(true);                             // every car repairs (pit or slipstream)
    expect(r.lead / r.wr).toBeGreaterThan(0.9);
    expect(r.lead / r.wr).toBeLessThan(1.1);
  });
});
