const { test, expect } = require('@playwright/test');
const path = require('path');

const FILE_URL = 'file://' + path.resolve(__dirname, '../index.html').replace(/\\/g, '/');

test.describe('Competitive AI & Track Progression', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(FILE_URL);
    await page.evaluate(() => {
      localStorage.clear();
      const s = {
        tutSeen: true,
        introSeen: true,
        lang: 'en',
        sound: false
      };
      localStorage.setItem('prstna-dirka', JSON.stringify(s));
    });
    await page.goto(FILE_URL);
    await page.waitForSelector('#menu.on', { timeout: 10000 });
  });

  test('Settings modal no longer displays manual difficulty picker (unified difficulty)', async ({ page }) => {
    await page.evaluate(() => {
      openSettings();
    });

    const diffOpts = page.locator('#diffOpts');
    await expect(diffOpts).toHaveCount(0);

    const lblSetDiff = page.locator('#lblSetDiff');
    await expect(lblSetDiff).toHaveCount(0);
  });

  test('getCompetitiveSkills scales from beginner on Track 1 to competitive on later tracks', async ({ page }) => {
    const skills = await page.evaluate(() => {
      return {
        track0: getCompetitiveSkills(0, 5),
        track1: getCompetitiveSkills(1, 5),
        track2: getCompetitiveSkills(2, 5),
        track3: getCompetitiveSkills(3, 5),
        track7: getCompetitiveSkills(7, 5)
      };
    });

    // Track 0 (Track 1 in game) is easier for beginners (lower speed multipliers ~1.4 - 1.5)
    expect(skills.track0[0]).toBeLessThan(1.6);
    expect(skills.track0[0]).toBeGreaterThan(1.35);

    // Track 3+ reaches full competitive World Record pace (~2.15 - 2.30 for AI 1, ~2.05 - 2.15 for AI 3)
    expect(skills.track3[0]).toBeGreaterThan(2.15);
    expect(skills.track3[2]).toBeGreaterThan(2.02);

    // Track 1 and 2 are smooth progressive steps between Track 0 and Track 3
    expect(skills.track1[0]).toBeGreaterThan(skills.track0[0] - 0.05);
    expect(skills.track2[0]).toBeGreaterThan(skills.track1[0] - 0.05);
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

  test('Starting a race applies competitive skills to racers', async ({ page }) => {
    const aiData = await page.evaluate(() => {
      startSingle(3); // Start single race on Track 4
      return {
        nai: aiParams.NAI,
        leadSkill: aiParams.SKILLS[0],
        thirdSkill: aiParams.SKILLS[2],
        racersCount: racers.length,
        leadRacerSpeed: racers[0].v
      };
    });

    expect(aiData.nai).toBe(5);
    expect(aiData.racersCount).toBe(5);
    // Track 4 has full competitive skills (~2.18 - 2.30 for leader)
    expect(aiData.leadSkill).toBeGreaterThan(2.15);
    expect(aiData.thirdSkill).toBeGreaterThan(2.00);
    expect(aiData.leadRacerSpeed).toBeGreaterThan(1500); // Competitive velocity
  });
});
