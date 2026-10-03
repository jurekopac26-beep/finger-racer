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

  test('Settings modal displays Easy (default) and Hard difficulty options and allows toggling', async ({ page }) => {
    await page.evaluate(() => {
      openSettings();
    });

    const diffOpts = page.locator('#diffOpts .setOpt');
    await expect(diffOpts).toHaveCount(2);

    // Easy option is selected by default
    const easyOpt = diffOpts.first();
    const hardOpt = diffOpts.nth(1);
    await expect(easyOpt).toHaveClass(/sel/);
    await expect(easyOpt).toContainText('Easy');
    await expect(hardOpt).not.toHaveClass(/sel/);
    await expect(hardOpt).toContainText('Hard');

    // Click Hard option
    await hardOpt.click();
    await expect(hardOpt).toHaveClass(/sel/);
    await expect(easyOpt).not.toHaveClass(/sel/);

    const savedMode = await page.evaluate(() => save.diffMode);
    expect(savedMode).toBe('hard');
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
        leadRacerSpeed: racers[0].v
      };
    });

    expect(hardData.leadSkill).toBeGreaterThan(2.40);
    expect(hardData.leadRacerSpeed).toBeGreaterThan(easyData.leadRacerSpeed);
  });
});
