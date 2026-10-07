const { test, expect } = require('@playwright/test');
const path = require('path');

const FILE_URL = 'file://' + path.resolve(__dirname, '../index.html').replace(/\\/g, '/');

test.describe('Beginning Language Selector & Dropdown', () => {

  // First run: no text screen — the language chip lives on the Rookie Ring welcome card
  async function firstRun(page) {
    await page.goto(FILE_URL);
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('prstna-dirka', JSON.stringify({ sound: false })); });
    await page.goto(FILE_URL);
    await page.waitForFunction(() => typeof TUT !== 'undefined' && TUT.card === 'welcome', null, { timeout: 15000 });
  }

  test('New player sees English by default with a language chip on the welcome card', async ({ page }) => {
    await firstRun(page);
    const chip = page.locator('#tutCLang');
    await expect(chip).toBeVisible();
    await expect(chip).toContainText('Change');
    await expect(page.locator('#tutCLang svg')).toBeVisible();
    await expect(page.locator('#tutCTitle')).toHaveText('Welcome to Finger Racer!');
    await expect(page.locator('#countryPickerModal')).toBeHidden();
  });

  test('Language chip opens the picker with all 7 countries', async ({ page }) => {
    await firstRun(page);
    await page.locator('#tutCLang').click();
    await expect(page.locator('#countryPickerModal')).toBeVisible();
    const items = page.locator('#countryListGrid .countryItem');
    await expect(items).toHaveCount(7);
    await expect(items.filter({ hasText: 'English' })).toHaveClass(/sel/);
    for (const n of ['Slovenščina', 'Deutsch', 'Italiano', 'Français', 'Español', 'Hrvatski'])
      await expect(items.filter({ hasText: n })).toHaveCount(1);
  });

  test('Selecting a different country switches the welcome card language immediately', async ({ page }) => {
    await firstRun(page);
    await page.locator('#tutCLang').click();
    await page.locator('#countryListGrid .countryItem').filter({ hasText: 'Deutsch' }).click();
    await expect(page.locator('#countryPickerModal')).toBeHidden();
    await expect(page.locator('#tutCTitle')).toHaveText('Willkommen bei Finger Racer!');
    await expect(page.locator('#tutCGo')).toHaveText('▶ Tutorial starten');
    await expect(page.locator('#tutCLang')).toContainText('Ändern');
    expect(await page.evaluate(() => [save.lang, save.country])).toEqual(['de', 'DE']);
  });

  test('Settings country picker modal also includes all 7 countries and syncs', async ({ page }) => {
    await page.goto(FILE_URL);
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('prstna-dirka', JSON.stringify({ tutSeen: true, lang: 'en', country: 'GB', sound: false }));
    });
    await page.goto(FILE_URL);
    await page.waitForSelector('#menu.on', { timeout: 15000 });

    // Open settings
    await page.locator('#btnSettingsGear').click();
    await expect(page.locator('#settings')).toHaveClass(/on/);

    // Click language trigger card
    await page.locator('#setLangCard').click();
    const modal = page.locator('#countryPickerModal');
    await expect(modal).toBeVisible();

    // Check all 7 countries are rendered in the settings modal
    const countryItems = page.locator('#countryListGrid .countryItem');
    await expect(countryItems).toHaveCount(7);

    // Click Slovenščina in the modal
    const slItem = countryItems.filter({ hasText: 'Slovenščina' });
    await slItem.click();

    // Modal closes and game language changes to sl
    await expect(modal).toBeHidden();
    const curLang = await page.evaluate(() => window.save.lang);
    expect(curLang).toBe('sl');
  });
});
