const { test, expect } = require('@playwright/test');
const path = require('path');

const FILE_URL = 'file://' + path.resolve(__dirname, '../index.html').replace(/\\/g, '/');

test.describe('Stuck on Track Pop-out Alert (Fuel & Damage)', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(FILE_URL);
    await page.evaluate(() => {
      localStorage.clear();
      const s = {
        tutSeen: true,
        introSeen: true,
        lang: 'sl',
        sound: false
      };
      localStorage.setItem('prstna-dirka', JSON.stringify(s));
    });
    await page.goto(FILE_URL);
    await page.waitForSelector('#menu.on', { timeout: 10000 });
  });

  test('Out of fuel triggers prominent pop-out message with mechanic status', async ({ page }) => {
    await page.evaluate(() => {
      startSingle(0);
      startRescue('fuel');
    });

    const alert = page.locator('#stuckAlert');
    await expect(alert).toBeVisible();
    await expect(alert).toHaveClass(/fuel/);
    await expect(page.locator('#stuckAlertTitle')).toHaveText(/ZMANJKALO GORIVA/);
    await expect(page.locator('#stuckAlertBody')).toContainText('kanistrom za zasilno dolitje');
    await expect(page.locator('#stuckAlertStatusText')).toContainText('Mehanik teče proti tebi');

    // Test updating status during work phase
    await page.evaluate(() => {
      updateStuckAlertStatus('⛽ Mehanik doliva gorivo (20%)...');
    });
    await expect(page.locator('#stuckAlertStatusText')).toHaveText('⛽ Mehanik doliva gorivo (20%)...');

    // Test close button
    await page.locator('#btnStuckAlertClose').click();
    await expect(alert).toBeHidden();
  });

  test('100% damage breakdown triggers damage pop-out alert in English', async ({ page }) => {
    await page.evaluate(() => {
      save.lang = 'en';
      startSingle(0);
      startRescue('repair');
    });

    const alert = page.locator('#stuckAlert');
    await expect(alert).toBeVisible();
    await expect(alert).toHaveClass(/damage/);
    await expect(page.locator('#stuckAlertTitle')).toHaveText(/100% DAMAGE/);
    await expect(page.locator('#stuckAlertBody')).toContainText('emergency repairs');
    await expect(page.locator('#stuckAlertStatusText')).toContainText('Mechanic is running to you');

    // Complete repair status
    await page.evaluate(() => {
      updateStuckAlertStatus('✅ Emergency repairs done (20%)! Head to the PIT LANE 🔧', true);
    });
    await expect(page.locator('#stuckAlertStatusText')).toContainText('Emergency repairs done');
  });

  test('Rival engine explosion on track triggers obstacle warning pop-out', async ({ page }) => {
    await page.evaluate(() => {
      startSingle(0);
      const fakeRacer = { name: 'Grom', s: 100, px: 200, py: 200, wrecked: false, finished: false };
      wreckRacer(fakeRacer);
    });

    const alert = page.locator('#stuckAlert');
    await expect(alert).toBeVisible();
    await expect(alert).toHaveClass(/rival/);
    await expect(page.locator('#stuckAlertTitle')).toHaveText(/OVIRA NA PROGI/);
    await expect(page.locator('#stuckAlertBody')).toContainText('Grom');
    await expect(page.locator('#stuckAlertStatusText')).toContainText('Nevarnost');
  });
});
