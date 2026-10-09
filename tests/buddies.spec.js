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

const ME = { tutSeen: true, introSeen: true, playerName: 'Ana', lang: 'en', uid: 'p_ana123', countryFlag: '🇸🇮' };

// Database calls are stubbed: these tests cover the UI and flow, not Firestore
async function stubBuddies(page, { ids = [], times = {} } = {}) {
  await page.evaluate(({ ids, times }) => {
    save.buddyCache = Object.fromEntries(ids.map(id => [id, { name: id.replace('p_', '').replace(/\d+$/, ''), flag: '' }]));
    window.buddyLoadList = async () => ids;
    window.buddyBestTimes = async (t, list) => Object.fromEntries(list.filter(id => times[id]).map(id => [id, times[id]]));
    window.__invited = 0;
    window.buddyInvite = async (asQr) => { window.__invited++; window.__invitedQr = !!asQr; };
  }, { ids, times });
}

test.describe('Buddies', () => {

  test('Buddies tab shows an empty state with Add buddy, and fits three tabs at 360px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await bootWithSave(page, ME);
    await page.waitForSelector('#menu.on', { timeout: 10000 });
    await stubBuddies(page);
    await page.evaluate(() => openLeaderboard('buddies'));
    await expect(page.locator('#btnLbTabBuddies')).toHaveClass(/on/);
    await expect(page.locator('#lbTrackBar')).toBeVisible();
    await expect(page.locator('.bdEmpty')).toBeVisible();
    await page.click('#btnBdAdd');
    expect(await page.evaluate(() => window.__invited)).toBe(1);
    await page.click('#btnBdQr');
    expect(await page.evaluate(() => window.__invitedQr)).toBe(true);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    expect(overflow).toBe(false);
  });

  test('Buddies board sorts me and my buddies by time with gaps to my time', async ({ page }) => {
    await bootWithSave(page, Object.assign({}, ME, { trackBest: { 1: 40.5 } }));
    await page.waitForSelector('#menu.on', { timeout: 10000 });
    await stubBuddies(page, { ids: ['p_bob1', 'p_cid2', 'p_dan3'], times: { p_ana123: 40.5, p_bob1: 39.9, p_cid2: 41.25 } });
    await page.evaluate(() => { currentLbTrack = 1; openLeaderboard('buddies'); });
    await expect(page.locator('#lbList .lbRow')).toHaveCount(4);
    const rows = await page.locator('#lbList .lbRow').allInnerTexts();
    expect(rows[0]).toContain('bob');
    expect(rows[0]).toContain('−0.60s');          // Bob is ahead of me
    expect(rows[1]).toContain('Ana');             // me
    expect(rows[2]).toContain('cid');
    expect(rows[2]).toContain('+0.75s');          // Cid is behind me
    expect(rows[3]).toContain('dan');
    expect(rows[3]).toContain('no time');
    await expect(page.locator('#lbList .lbRow.me')).toHaveCount(1);
    await expect(page.locator('#lbList .lbRow .bdX')).toHaveCount(3);   // remove buttons for buddies only
  });

  test('Opening a buddy link asks to add them, then shows the Buddies board', async ({ page }) => {
    await bootWithSave(page, ME, FILE_URL + '?buddy=p_bob1&k=abcdefghijkmnpqr&n=Bob');
    await expect(page.locator('#buddyModal')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#buddyModalDesc')).toContainText('Bob');
    expect(await page.evaluate(() => location.search)).not.toContain('buddy=');
    await page.evaluate(() => {
      window.__added = null;
      window.buddyAdd = async (id, key) => { window.__added = { id, key }; save.buddyCache = { p_bob1: { name: 'Bob' } }; return true; };
      window.buddyLoadList = async () => ['p_bob1'];
      window.buddyBestTimes = async () => ({});
    });
    await page.click('#btnBuddyModalOk');
    await expect(page.locator('#leaderboard')).toHaveClass(/on/);
    await expect(page.locator('#btnLbTabBuddies')).toHaveClass(/on/);
    const added = await page.evaluate(() => window.__added);
    expect(added).toEqual({ id: 'p_bob1', key: 'abcdefghijkmnpqr' });
  });

  test('Opening my own buddy link is ignored', async ({ page }) => {
    await bootWithSave(page, ME, FILE_URL + '?buddy=p_ana123&k=abcdefghijkmnpqr&n=Ana');
    await page.waitForSelector('#menu.on', { timeout: 10000 });
    await expect(page.locator('#buddyModal')).toBeHidden();
  });

  test('A buddy beating my time shows the toast once, with a race button', async ({ page }) => {
    await bootWithSave(page, Object.assign({}, ME, { trackBest: { 2: 50 } }));
    await page.waitForSelector('#menu.on', { timeout: 10000 });
    await stubBuddies(page, { ids: ['p_bob1'], times: { p_bob1: 49.5 } });
    await page.evaluate(() => buddyCheckBeaten());
    await expect(page.locator('#buddyToast')).toBeVisible();
    await expect(page.locator('#buddyToastTitle')).toContainText('bob');
    await expect(page.locator('#buddyToastSub')).toContainText('−0.50s');
    await page.click('#btnBuddyToastClose');
    await expect(page.locator('#buddyToast')).toBeHidden();
    // Same time again → no repeat alert
    await page.evaluate(() => buddyCheckBeaten());
    await page.waitForTimeout(300);
    await expect(page.locator('#buddyToast')).toBeHidden();
  });

  test('Duplicate buddy entries with the same name are deduplicated on the Buddies leaderboard', async ({ page }) => {
    await bootWithSave(page, Object.assign({}, ME, { trackBest: { 1: 40.0 } }));
    await page.waitForSelector('#menu.on', { timeout: 10000 });
    // Simulate two buddy accounts with the exact same player name "PeRcPiskot", one with a time and one without
    await page.evaluate(() => {
      save.buddyCache = {
        p_perc1: { name: 'PeRcPiskot', flag: '🇬🇧' },
        p_perc2: { name: 'PeRcPiskot', flag: '🇸🇮' }
      };
      window.buddyLoadList = async () => ['p_perc1', 'p_perc2'];
      window.buddyBestTimes = async (t, list) => ({ p_ana123: 40.0, p_perc2: 38.5 });
    });
    await page.evaluate(() => { currentLbTrack = 1; openLeaderboard('buddies'); });
    // Expect 2 rows: 1 for user Ana and 1 for PeRcPiskot (the faster one), not 3 rows
    await expect(page.locator('#lbList .lbRow')).toHaveCount(2);
    const rows = await page.locator('#lbList .lbRow').allInnerTexts();
    expect(rows[0]).toContain('PeRcPiskot');
    expect(rows[0]).toContain('−1.50s');
    expect(rows[1]).toContain('Ana');
  });
});
