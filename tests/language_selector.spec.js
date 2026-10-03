const { test, expect } = require('@playwright/test');
const path = require('path');

const FILE_URL = 'file://' + path.resolve(__dirname, '../index.html').replace(/\\/g, '/');

test.describe('Beginning Language Selector & Dropdown', () => {

  test('New player sees English by default with dropdown on tutorial screen', async ({ page }) => {
    await page.goto(FILE_URL);
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('prstna-dirka', JSON.stringify({ tutSeen: false, sound: false }));
    });
    await page.goto(FILE_URL);
    await page.waitForSelector('#tutorial.on', { timeout: 15000 });

    // Verify language dropdown trigger exists
    const tutDropdownBtn = page.locator('#tutLangDropdownBtn');
    await expect(tutDropdownBtn).toBeVisible();

    // Default should be English
    const curName = page.locator('#tutLangCurName');
    await expect(curName).toHaveText('English');

    const curSub = page.locator('#tutLangCurSub');
    await expect(curSub).toHaveText(/UK \/ International/);

    // Verify SVG flag is inside curFlag
    const curFlagSvg = page.locator('#tutLangCurFlag svg');
    await expect(curFlagSvg).toBeVisible();

    // Tutorial text should be in English
    const tutTitle = page.locator('#tutTitle');
    await expect(tutTitle).toContainText('How to play');

    const tutBtnText = page.locator('#tutBtnText');
    await expect(tutBtnText).toContainText("Got it! Let's Race");

    // Dropdown list should initially not be visible
    const tutList = page.locator('#tutLangList');
    await expect(tutList).toBeHidden();
  });

  test('Clicking dropdown reveals all 7 countries', async ({ page }) => {
    await page.goto(FILE_URL);
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('prstna-dirka', JSON.stringify({ tutSeen: false, sound: false }));
    });
    await page.goto(FILE_URL);
    await page.waitForSelector('#tutorial.on', { timeout: 15000 });

    const tutDropdownBtn = page.locator('#tutLangDropdownBtn');
    await tutDropdownBtn.click();

    const tutList = page.locator('#tutLangList');
    await expect(tutList).toBeVisible();

    const items = tutList.locator('.langDropdownItem');
    await expect(items).toHaveCount(7);

    // Verify English is marked as selected
    const enItem = items.nth(0);
    await expect(enItem).toHaveClass(/sel/);
    await expect(enItem).toContainText('English');

    // Verify other languages exist in the list
    await expect(items.filter({ hasText: 'Slovenščina' })).toHaveCount(1);
    await expect(items.filter({ hasText: 'Deutsch' })).toHaveCount(1);
    await expect(items.filter({ hasText: 'Italiano' })).toHaveCount(1);
    await expect(items.filter({ hasText: 'Français' })).toHaveCount(1);
    await expect(items.filter({ hasText: 'Español' })).toHaveCount(1);
    await expect(items.filter({ hasText: 'Hrvatski' })).toHaveCount(1);
  });

  test('Selecting a different country switches language immediately and closes dropdown', async ({ page }) => {
    await page.goto(FILE_URL);
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('prstna-dirka', JSON.stringify({ tutSeen: false, sound: false }));
    });
    await page.goto(FILE_URL);
    await page.waitForSelector('#tutorial.on', { timeout: 15000 });

    // Open dropdown
    await page.locator('#tutLangDropdownBtn').click();
    const tutList = page.locator('#tutLangList');
    await expect(tutList).toBeVisible();

    // Select Deutsch
    const deItem = tutList.locator('.langDropdownItem').filter({ hasText: 'Deutsch' });
    await deItem.click();

    // Dropdown should close
    await expect(tutList).toBeHidden();

    // Trigger should update to Deutsch
    await expect(page.locator('#tutLangCurName')).toHaveText('Deutsch');

    // Tutorial content should update to German
    await expect(page.locator('#tutTitle')).toContainText('So wird gespielt');
    await expect(page.locator('#tutBtnText')).toContainText("Verstanden! Los geht's");

    // save in localStorage should be updated
    const savedLang = await page.evaluate(() => window.save.lang);
    const savedCountry = await page.evaluate(() => window.save.country);
    expect(savedLang).toBe('de');
    expect(savedCountry).toBe('DE');
  });

  test('Clicking outside closes the tutorial language dropdown', async ({ page }) => {
    await page.goto(FILE_URL);
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('prstna-dirka', JSON.stringify({ tutSeen: false, sound: false }));
    });
    await page.goto(FILE_URL);
    await page.waitForSelector('#tutorial.on', { timeout: 15000 });

    await page.locator('#tutLangDropdownBtn').click();
    const tutList = page.locator('#tutLangList');
    await expect(tutList).toBeVisible();

    // Click outside on the background panel / top margin
    await page.mouse.click(10, 10);
    await expect(tutList).toBeHidden();
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
