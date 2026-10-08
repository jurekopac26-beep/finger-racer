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

async function openPrivateRoom(page) {
  await page.waitForSelector('#menu.on', { timeout: 10000 });
  await page.evaluate(() => {
    openMP();
    mpCreateRoom({ isPublic: false }, 'Share Test');
  });
  await expect(page.locator('#mpLobby')).toHaveClass(/on/);
  await expect(page.locator('#mpCodeBoxNew')).toBeVisible();
  return page.evaluate(() => mp.code);
}

test.describe('Multiplayer invite sheet', () => {

  test('Invite button opens sheet with room code, QR and native share link', async ({ page }) => {
    await page.addInitScript(() => {
      navigator.share = (data) => { window.__shared = data; return Promise.resolve(); };
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await bootWithSave(page, { tutSeen: true, introSeen: true, playerName: 'Ana', lang: 'en' });
    const code = await openPrivateRoom(page);

    await page.click('#btnMpShare');
    await expect(page.locator('#mpShareModal')).toBeVisible();
    await expect(page.locator('#mpShareCode')).toHaveText(code);
    await expect(page.locator('#btnMpShareNative')).toBeVisible();

    // QR is collapsed when native share exists; toggling shows a drawn code
    await expect(page.locator('#mpShareQr')).toBeHidden();
    await page.click('#btnMpShareQr');
    await expect(page.locator('#mpShareQr')).toBeVisible();
    const qr = await page.evaluate(() => {
      const cv = document.getElementById('mpShareQrCanvas');
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      let dark = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] < 50) dark++;
      return { w: cv.width, dark };
    });
    expect(qr.w).toBeGreaterThan(0);
    expect(qr.dark).toBeGreaterThan(100);

    await page.click('#btnMpShareNative');
    const shared = await page.evaluate(() => window.__shared);
    expect(shared.url).toContain('?room=' + code);
    expect(shared.text).toContain(code);

    // No horizontal overflow at phone width while the sheet is open
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    expect(overflow).toBe(false);

    await page.click('#btnMpShareClose');
    await expect(page.locator('#mpShareModal')).toBeHidden();
  });

  test('Without native share the QR is shown right away', async ({ page }) => {
    await page.addInitScript(() => { try { delete Navigator.prototype.share; } catch (e) {} navigator.share = undefined; });
    await bootWithSave(page, { tutSeen: true, introSeen: true, playerName: 'Ana', lang: 'en' });
    await openPrivateRoom(page);
    await page.click('#btnMpShare');
    await expect(page.locator('#btnMpShareNative')).toBeHidden();
    await expect(page.locator('#mpShareQr')).toBeVisible();
  });

  test('Opening ?room=CODE without a name asks for one, then joins that room', async ({ page }) => {
    await bootWithSave(page, { lang: 'en' }, FILE_URL + '?room=abcde');

    await expect(page.locator('#nameOnboardModal')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#onboardDesc')).toContainText('ABCDE');
    await page.fill('#onboardNameInput', 'Bojan');
    await page.click('#btnOnboardSave');

    await expect(page.locator('#mpLobby')).toHaveClass(/on/);
    const st = await page.evaluate(() => ({ code: mp.code, roomId: mp.roomId, name: save.playerName, search: location.search }));
    expect(st.code).toBe('ABCDE');
    expect(st.roomId).toBe('PRIV-ABCDE');
    expect(st.name).toBe('Bojan');
    expect(st.search).not.toContain('room=');
  });

  test('Opening ?room=CODE with a name joins immediately, skipping the first-run tutorial', async ({ page }) => {
    await bootWithSave(page, { playerName: 'Bojan', lang: 'en' }, FILE_URL + '?room=XYZ12');
    await expect(page.locator('#mpLobby')).toHaveClass(/on/, { timeout: 10000 });
    await expect(page.locator('#nameOnboardModal')).toBeHidden();
    expect(await page.evaluate(() => mp.roomId)).toBe('PRIV-XYZ12');
  });
});

test.describe('Multiplayer invite sheet — public rooms', () => {

  test('Public room shows the Invite button and its link carries pub=1', async ({ page }) => {
    await page.addInitScript(() => {
      navigator.share = (data) => { window.__shared = data; return Promise.resolve(); };
    });
    await page.setViewportSize({ width: 360, height: 740 });
    await bootWithSave(page, { tutSeen: true, introSeen: true, playerName: 'Ana', lang: 'en' });
    await page.waitForSelector('#menu.on', { timeout: 10000 });
    await page.evaluate(() => { openMP(); mpCreateRoom({ isPublic: true }, 'Public Test'); });
    await expect(page.locator('#mpLobby')).toHaveClass(/on/);
    await expect(page.locator('#mpPublicTag')).toBeVisible();
    await expect(page.locator('#btnMpShare')).toBeVisible();

    const code = await page.evaluate(() => mp.code);
    await page.click('#btnMpShare');
    await page.click('#btnMpShareNative');
    const shared = await page.evaluate(() => window.__shared);
    expect(shared.url).toContain('?room=' + code + '&pub=1');

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    expect(overflow).toBe(false);
  });

  test('Opening ?room=CODE&pub=1 joins the PUBLIC room', async ({ page }) => {
    await bootWithSave(page, { playerName: 'Bojan', lang: 'en' }, FILE_URL + '?room=PUB77&pub=1');
    await expect(page.locator('#mpLobby')).toHaveClass(/on/, { timeout: 10000 });
    const st = await page.evaluate(() => ({ roomId: mp.roomId, isPublic: mp.isPublic, search: location.search }));
    expect(st.roomId).toBe('PUB-PUB77');
    expect(st.isPublic).toBe(true);
    expect(st.search).not.toContain('pub=');
  });
});
