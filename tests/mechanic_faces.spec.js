const { test, expect } = require('@playwright/test');
const path = require('path');

const FILE_URL = 'file://' + path.resolve(__dirname, '../index.html').replace(/\\/g, '/');

test.describe('Mechanic Personalization & Facial Expressions', () => {

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

  test('drawMechanicFace is defined and renders all face expressions without error', async ({ page }) => {
    const result = await page.evaluate(() => {
      const cvs = document.createElement('canvas');
      cvs.width = 200;
      cvs.height = 200;
      const ctx = cvs.getContext('2d');

      const expressions = ['smile', 'grin', 'open', 'smirk', 'focus'];
      const errors = [];

      expressions.forEach((expr, idx) => {
        try {
          drawMechanicFace(ctx, 30 + idx * 30, 50, 1.5, expr);
        } catch (e) {
          errors.push({ expr, err: e.message });
        }
      });

      return {
        hasFn: typeof drawMechanicFace === 'function',
        errors
      };
    });

    expect(result.hasFn).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('Pit crew and rescue mechanics render smoothly during race with expressions', async ({ page }) => {
    const result = await page.evaluate(() => {
      startSingle(0);
      beginRace();
      startRescue('repair');

      // Check pitCrew generated
      const crewCount = pitCrew.length;

      // Check rescue mechanic active
      const hasRescue = fuelRescue !== null;

      // Simulate a draw frame to ensure drawPitCrew and drawFuelRescue execute cleanly
      const fgCanvas = document.getElementById('fg');
      const ctx = fgCanvas.getContext('2d');
      drawPitCrew(ctx, 1 / scale);
      drawFuelRescue(ctx, 1 / scale);

      return {
        crewCount,
        hasRescue,
        rescueMode: fuelRescue ? fuelRescue.mode : null
      };
    });

    expect(result.crewCount).toBeGreaterThan(0);
    expect(result.hasRescue).toBe(true);
    expect(result.rescueMode).toBe('repair');
  });

  test('Capture visual screenshot of mechanic face expressions', async ({ page }) => {
    await page.evaluate(() => {
      startSingle(0);
      startRescue('repair');
    });

    // Let the canvas render a few frames
    await page.waitForTimeout(500);

    const fg = page.locator('#fg');
    await expect(fg).toBeVisible();
  });
});
