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

// ---- When "Save my progress" is suggested (never on first launch) ----
test.describe('Save-progress suggestions', () => {

  // Results screen with Firestore + auth simulated (no network): an empty leaderboard, a not-signed-in player
  async function setupResults(page, extraSave = {}) {
    await bootWithSave(page, Object.assign({}, ME, extraSave));
    await page.waitForSelector('#menu.on', { timeout: 10000 });
    await page.evaluate(() => {
      const empty = { size: 0, docs: [], empty: true, forEach() {} };
      const q = { where: () => q, orderBy: () => q, limit: () => q, get: async () => empty };
      db = { collection: () => ({ doc: () => ({ collection: () => q }) }) };
      fbAuth = { currentUser: { isAnonymous: true } };
      setScreen('results');
    });
  }
  // One finished race: t vs previous best (t < prev → personal best)
  const race = (page, t, prev) => page.evaluate(async ({ t, prev }) => {
    document.getElementById('resGlobal').innerHTML = '';
    await showGlobalRankCard(1, t, prev);
    return !!document.querySelector('#resGlobal .rgSave');
  }, { t, prev });
  const skipDay = (page) => page.evaluate(() => { save.accNudge.lastShown = 0; });

  test('First personal best shows the save card; Save opens the sign-in modal', async ({ page }) => {
    await setupResults(page);
    expect(await race(page, 40, 41)).toBe(true);
    await expect(page.locator('#resGlobal .rgSave')).toContainText('New record');
    await page.click('#resGlobal .rsSave');
    await expect(page.locator('#accModal')).toBeVisible();
    await expect(page.locator('#accTitle')).toContainText('KEEP YOUR RECORDS');
  });

  test('After "Not now": shown again on the 3rd PB, and never more than 3 times', async ({ page }) => {
    await setupResults(page);
    expect(await race(page, 50, 51)).toBe(true);           // 1st PB → shown (1)
    await page.click('#resGlobal .rsLater');
    await expect(page.locator('#resGlobal .rgSave')).toHaveCount(0);
    const seen = [];
    let t = 49;
    for (let i = 0; i < 9; i++) { await skipDay(page); seen.push(await race(page, t, t + 0.5)); t -= 1; }
    // PB #2,#3 no · #4 yes (2) · #5,#6 no · #7 yes (3) · then never again
    expect(seen).toEqual([false, false, true, false, false, true, false, false, false]);
  });

  test('Not shown for signed-in players, for a race that is not a PB, or twice within 24 h', async ({ page }) => {
    await setupResults(page);
    expect(await race(page, 42, 41)).toBe(false);          // slower than best → no PB
    expect(await race(page, 40, 41)).toBe(true);           // PB → shown
    for (let i = 0; i < 3; i++) expect(await race(page, 39 - i, 40 - i)).toBe(false);   // 3 more PBs, same day → none
    await page.evaluate(() => { fbAuth = { currentUser: { isAnonymous: false, email: 'a@b.c', providerData: [] } }; save.accNudge = null; });
    expect(await race(page, 30, 31)).toBe(false);          // signed in → never
  });

  test('Fresh first launch: no sign-in modal or save card anywhere', async ({ page }) => {
    await page.goto(FILE_URL);
    await page.evaluate(() => localStorage.clear());
    await page.goto(FILE_URL);
    await page.waitForTimeout(6000);                         // boot, intro/tutorial, buddy checks…
    await expect(page.locator('#accModal')).toBeHidden();
    await expect(page.locator('.rgSave')).toHaveCount(0);
  });

  test('Buddies tab shows a passive save hint only while not signed in', async ({ page }) => {
    await bootWithSave(page, ME);
    await page.waitForSelector('#menu.on', { timeout: 10000 });
    await page.evaluate(() => { fbAuth = { currentUser: { isAnonymous: true } }; window.buddyLoadList = async () => []; openLeaderboard('buddies'); });
    await expect(page.locator('.bdSaveHint')).toBeVisible();
    await page.click('.bdSaveHint');
    await expect(page.locator('#accModal')).toBeVisible();
    await expect(page.locator('#accTitle')).toContainText("DON'T LOSE YOUR BUDDIES");
    await page.click('#btnAccClose');
    await page.evaluate(() => { fbAuth = { currentUser: { isAnonymous: false, email: 'a@b.c', providerData: [] } }; openLeaderboard('buddies'); });
    await page.waitForTimeout(300);
    await expect(page.locator('.bdSaveHint')).toHaveCount(0);
  });

  test('Finishing a World Cup shows the save card on the final standings, only once', async ({ page }) => {
    await bootWithSave(page, ME);
    await page.waitForSelector('#menu.on', { timeout: 10000 });
    // A finished cup, built like startWC() does
    const finalCup = () => page.evaluate(() => {
      fbAuth = { currentUser: { isAnonymous: true } };
      const ents = [];
      for (let k = 0; k < 5; k++) ents.push({ name: NAMES[k], color: COLORS[k], me: false });
      ents.push({ name: 'Ana', color: '#3dff8e', me: true });
      wc = { name: 'Ana', race: WC_TRACKS.length - 1, order: WC_TRACKS.slice(), pts: [10, 8, 6, 4, 2, 12], ents,
        recs: WC_TRACKS.map(() => ({ time: 60 })), done: WC_TRACKS.length, finalShown: true,
        stats: { pits: 0, dmg: 0, draftRep: 0, pitRep: 0, wins: 1, podiums: 2, crashes: 0, bestLap: null, bestLapName: null, bestTime: null, bestPos: 1 } };
      showWCStand(true, null);
      return !!document.querySelector('#wcRecords .rgSave');
    });
    expect(await finalCup()).toBe(true);
    await expect(page.locator('#wcStand')).toHaveClass(/on/);
    await expect(page.locator('#wcRecords .rgSave')).toContainText('Cup finished');
    await page.click('#wcRecords .rsSave');
    await expect(page.locator('#accTitle')).toContainText('KEEP YOUR CUP PROGRESS');
    await page.click('#btnAccClose');
    await page.evaluate(() => { save.accNudge.lastShown = 0; });   // even a day later…
    expect(await finalCup()).toBe(false);                        // …the cup card never shows twice
  });
});
