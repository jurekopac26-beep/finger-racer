const { test, expect } = require('@playwright/test');
const path = require('path');

const FILE_URL = 'file://' + path.resolve(__dirname, '../index.html').replace(/\\/g, '/');

async function bootWithSave(page, saveObj, url = FILE_URL) {
  await page.goto(FILE_URL);
  await page.evaluate((s) => {
    localStorage.clear();
    localStorage.setItem('prstna-dirka', JSON.stringify(s));
  }, saveObj);
  await page.goto(url);
}

const ME = { tutSeen: true, introSeen: true, playerName: 'Ana', lang: 'en', uid: 'p_ana123' };

async function openSettingsScreen(page) {
  await page.waitForSelector('#menu.on', { timeout: 10000 });
  await page.evaluate(() => { openSettings(); setScreen('settings'); });
}

// Firebase Auth isn't reachable from file:// — these tests cover the UI and the save/restore plumbing
test.describe('Account: save my progress', () => {

  test('Settings shows "Save my progress" and opens the sign-in modal', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await bootWithSave(page, ME);
    await openSettingsScreen(page);
    await expect(page.locator('#setAccCard')).toContainText('Save my progress');
    await page.click('#btnAccOpen');
    await expect(page.locator('#accModal')).toBeVisible();
    await expect(page.locator('#btnAccGoogle')).toContainText('Continue with Google');
    await expect(page.locator('#accEmail')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    expect(overflow).toBe(false);
    await page.click('#btnAccClose');
    await expect(page.locator('#accModal')).toBeHidden();
  });

  test('Email link: invalid address is rejected, valid one shows "check your inbox"', async ({ page }) => {
    await bootWithSave(page, ME);
    await openSettingsScreen(page);
    await page.evaluate(() => {
      window.__sent = null;
      window.accSendEmailLink = async (email) => { window.__sent = email; };
    });
    await page.click('#btnAccOpen');
    await page.fill('#accEmail', 'not-an-email');
    await page.click('#btnAccEmail');
    expect(await page.evaluate(() => window.__sent)).toBeNull();
    await page.fill('#accEmail', 'ana@example.com');
    await page.press('#accEmail', 'Enter');
    await expect(page.locator('#accSent')).toBeVisible();
    await expect(page.locator('#accSent')).toContainText('ana@example.com');
    await expect(page.locator('#accEmailRow')).toBeHidden();
    expect(await page.evaluate(() => window.__sent)).toBe('ana@example.com');
  });

  test('Signed-in state shows the account and a Sign out button', async ({ page }) => {
    await bootWithSave(page, ME);
    await page.waitForSelector('#menu.on', { timeout: 10000 });
    await page.evaluate(() => {
      window.accIsLinked = () => true;
      window.accLabel = () => 'ana@example.com';
      openSettings(); setScreen('settings');
    });
    await expect(page.locator('#setAccCard')).toContainText('Progress saved');
    await expect(page.locator('#setAccCard')).toContainText('ana@example.com');
    await expect(page.locator('#btnAccSignOut')).toBeVisible();
  });

  test('Cloud save blob keeps progress and racer id but drops ghosts and device-only fields', async ({ page }) => {
    await bootWithSave(page, Object.assign({}, ME, {
      trackBest: { 1: 40.5 }, claimedBy: 'authXYZ', _profSig: 'x',
      ghosts: { a: [1, 2, 3] }, tt: { 0: { time: 30, ghost: [[1, 2]] } }
    }));
    await page.waitForSelector('#menu.on', { timeout: 10000 });
    const blob = await page.evaluate(() => JSON.parse(accSaveBlob()));
    expect(blob.uid).toBe('p_ana123');
    expect(blob.trackBest['1']).toBe(40.5);
    expect(blob.tt['0'].time).toBe(30);
    expect(blob.tt['0'].ghost).toBeUndefined();
    expect(blob.ghosts).toBeUndefined();
    expect(blob.claimedBy).toBeUndefined();
    expect(blob._profSig).toBeUndefined();
  });

  test('Restoring progress replaces this device\'s save and reloads with the restored racer', async ({ page }) => {
    await bootWithSave(page, ME);
    await page.waitForSelector('#menu.on', { timeout: 10000 });
    await Promise.all([
      page.waitForEvent('load'),
      page.evaluate(() => accApplyRestore({ uid: 'p_restored9', playerName: 'Restored', tutSeen: true, introSeen: true, lang: 'en', trackBest: { 3: 55.5 } }))
    ]);
    await page.waitForSelector('#menu.on', { timeout: 10000 });
    const st = await page.evaluate(() => ({ uid: save.uid, name: save.playerName, best: save.trackBest && save.trackBest[3] }));
    expect(st).toEqual({ uid: 'p_restored9', name: 'Restored', best: 55.5 });
  });

  test('After adding the first buddy, "Save my progress" is suggested once', async ({ page }) => {
    await bootWithSave(page, ME, FILE_URL + '?buddy=p_bob1&k=abcdefghijkmnpqr&n=Bob');
    await expect(page.locator('#buddyModal')).toBeVisible({ timeout: 10000 });
    await page.evaluate(() => {
      window.buddyAdd = async () => { save.buddyCache = { p_bob1: { name: 'Bob' } }; return true; };
      window.buddyLoadList = async () => ['p_bob1'];
      window.buddyBestTimes = async () => ({});
    });
    await page.click('#btnBuddyModalOk');
    await expect(page.locator('#accModal')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#accTitle')).toContainText("DON'T LOSE YOUR BUDDIES");
    expect(await page.evaluate(() => save.accPromptedBuddy)).toBe(true);
  });
});
