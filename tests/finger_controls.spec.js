const { test, expect } = require('@playwright/test');
const path = require('path');

const FILE_URL = 'file://' + path.resolve(__dirname, '../index.html').replace(/\\/g, '/');

test.describe('Finger Control Options & Disc Size Removal', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(FILE_URL);
    await page.evaluate(() => {
      localStorage.clear();
      const s = {
        tutSeen: true,
        introSeen: true,
        freemiumMode: false,
        lang: 'sl',
        sound: false,
        fingerOff: 0
      };
      localStorage.setItem('prstna-dirka', JSON.stringify(s));
    });
    await page.goto(FILE_URL);
    await page.waitForSelector('#menu.on', { timeout: 10000 });
  });

  test('Disc size setting is completely removed from Settings modal', async ({ page }) => {
    // Open settings modal
    await page.locator('#btnSettingsGear').click();
    await expect(page.locator('#settings')).toHaveClass(/on/);

    // Verify disc size options do not exist
    await expect(page.locator('#sizeOpts')).toHaveCount(0);
    await expect(page.locator('#lblSetSize')).toHaveCount(0);
  });

  test('Settings displays the 3 finger control options (0, 70, rope)', async ({ page }) => {
    await page.locator('#btnSettingsGear').click();
    await expect(page.locator('#settings')).toHaveClass(/on/);

    const fingerOpts = page.locator('#fingerOpts .setOpt');
    await expect(fingerOpts).toHaveCount(3);

    // Check Slovenian text
    await expect(fingerOpts.nth(0)).toContainText('Na avtu');
    await expect(fingerOpts.nth(1)).toContainText('Pod avtom (70 px)');
    await expect(fingerOpts.nth(2)).toContainText('Vleka z vrvjo');

    // Click 70px option
    await fingerOpts.nth(1).click();
    await expect(fingerOpts.nth(1)).toHaveClass(/sel/);
    let saveVal = await page.evaluate(() => JSON.parse(localStorage.getItem('prstna-dirka')).fingerOff);
    expect(saveVal).toBe(70);

    // Click rope option
    await fingerOpts.nth(2).click();
    await expect(fingerOpts.nth(2)).toHaveClass(/sel/);
    saveVal = await page.evaluate(() => JSON.parse(localStorage.getItem('prstna-dirka')).fingerOff);
    expect(saveVal).toBe('rope');

    // Click 0 option
    await fingerOpts.nth(0).click();
    await expect(fingerOpts.nth(0)).toHaveClass(/sel/);
    saveVal = await page.evaluate(() => JSON.parse(localStorage.getItem('prstna-dirka')).fingerOff);
    expect(saveVal).toBe(0);
  });

  test('Bilingual support in Settings for finger options (English)', async ({ page }) => {
    await page.evaluate(() => {
      window.applyLang('en');
      window.save.lang = 'en';
      window.persist();
    });

    await page.locator('#btnSettingsGear').click();
    await expect(page.locator('#settings')).toHaveClass(/on/);

    const fingerOpts = page.locator('#fingerOpts .setOpt');
    await expect(fingerOpts.nth(0)).toContainText('On car');
    await expect(fingerOpts.nth(1)).toContainText('Under car (70 px)');
    await expect(fingerOpts.nth(2)).toContainText('Rope drag');
  });

  test('Legacy fingerOff (140, 210) automatically migrates to 70', async ({ page }) => {
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('prstna-dirka') || '{}');
      s.fingerOff = 140;
      localStorage.setItem('prstna-dirka', JSON.stringify(s));
    });
    await page.goto(FILE_URL);
    await page.waitForSelector('#menu.on', { timeout: 10000 });

    const saveVal = await page.evaluate(() => JSON.parse(localStorage.getItem('prstna-dirka')).fingerOff);
    expect(saveVal).toBe(70);
  });

  test('Helper functions getFingerOffset and getFingerSlotPos work correctly without error', async ({ page }) => {
    const results = await page.evaluate(() => {
      // Test getFingerOffset
      window.save.fingerOff = 0;
      const off0 = window.getFingerOffset();
      window.save.fingerOff = 70;
      const off70 = window.getFingerOffset();
      window.save.fingerOff = 'rope';
      const offRope = window.getFingerOffset();

      // Test slot pos
      const slot = { x: 100, y: 100, i: 0 };
      const slotPos = window.getFingerSlotPos(slot);

      return { off0, off70, offRope, slotPosValid: typeof slotPos.x === 'number' && !isNaN(slotPos.x) };
    });

    expect(results.off0).toBe(0);
    expect(results.off70).toBe(70);
    expect(results.offRope).toBe(0);
    expect(results.slotPosValid).toBe(true);
  });

});
