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

  test('Big Invite button opens the native share menu with the join link', async ({ page }) => {
    await page.addInitScript(() => {
      navigator.share = (data) => { window.__shared = data; return Promise.resolve(); };
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await bootWithSave(page, { tutSeen: true, introSeen: true, playerName: 'Ana', lang: 'en' });
    const code = await openPrivateRoom(page);

    await expect(page.locator('#btnMpShare')).toBeVisible();
    await page.click('#btnMpShare');
    await expect(page.locator('#mpShareModal')).toBeHidden();   // straight to the phone's share menu
    const shared = await page.evaluate(() => window.__shared);
    expect(shared.url).toContain('?room=' + code);
    expect(shared.text).toContain(code);

    // An empty racer slot invites too
    await page.evaluate(() => { window.__shared = null; });
    await page.locator('.mpRacerCard.open').first().click();
    expect((await page.evaluate(() => window.__shared)).url).toContain('?room=' + code);
  });

  test('QR button opens the scan sheet with a drawn QR, code and link actions', async ({ page }) => {
    await page.addInitScript(() => {
      navigator.share = (data) => { window.__shared = data; return Promise.resolve(); };
    });
    await page.setViewportSize({ width: 360, height: 740 });
    await bootWithSave(page, { tutSeen: true, introSeen: true, playerName: 'Ana', lang: 'en' });
    const code = await openPrivateRoom(page);

    await page.click('#btnMpQr');
    await expect(page.locator('#mpShareModal')).toBeVisible();
    await expect(page.locator('#mpShareQr')).toBeVisible();
    await expect(page.locator('#mpShareCode')).toHaveText(code);
    await expect(page.locator('#btnMpShareCopy')).toBeVisible();
    await expect(page.locator('#btnMpShareNative')).toBeVisible();
    const qr = await page.evaluate(() => {
      const cv = document.getElementById('mpShareQrCanvas');
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      let dark = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] < 50) dark++;
      return { w: cv.width, dark };
    });
    expect(qr.w).toBeGreaterThan(0);
    expect(qr.dark).toBeGreaterThan(100);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    expect(overflow).toBe(false);

    await page.click('#btnMpShareClose');
    await expect(page.locator('#mpShareModal')).toBeHidden();
  });

  test('Without native share, Invite opens the QR sheet instead', async ({ page }) => {
    await page.addInitScript(() => { try { delete Navigator.prototype.share; } catch (e) {} navigator.share = undefined; });
    await bootWithSave(page, { tutSeen: true, introSeen: true, playerName: 'Ana', lang: 'en' });
    await openPrivateRoom(page);
    await page.click('#btnMpShare');
    await expect(page.locator('#mpShareModal')).toBeVisible();
    await expect(page.locator('#btnMpShareNative')).toBeHidden();
    await expect(page.locator('#mpShareQr')).toBeVisible();
  });

  for (const vp of [{ w: 360, h: 740 }, { w: 390, h: 844 }]) {
    test(`Host room fits on one screen without scrolling at ${vp.w}x${vp.h}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await bootWithSave(page, { tutSeen: true, introSeen: true, playerName: 'Ana', lang: 'en' });
      await openPrivateRoom(page);
      await expect(page.locator('#mpTrackPick')).toBeVisible();
      const m = await page.evaluate(() => {
        const s = document.getElementById('mpLobby');
        const row = ['mpTracks', 'mpLapsSel', 'mpAISel'].map(id => document.getElementById(id).getBoundingClientRect().top);
        return { scrollH: s.scrollHeight, clientH: s.clientHeight, rowSpread: Math.max(...row) - Math.min(...row),
                 hOverflow: document.documentElement.scrollWidth > window.innerWidth + 2 };
      });
      expect(m.scrollH, 'room screen needs vertical scrolling').toBeLessThanOrEqual(m.clientH + 2);
      expect(m.rowSpread, 'track / laps / AI are not on one row').toBeLessThan(20);
      expect(m.hOverflow).toBe(false);
    });
  }

  test('Laps and AI dropdowns update the room settings', async ({ page }) => {
    await bootWithSave(page, { tutSeen: true, introSeen: true, playerName: 'Ana', lang: 'en' });
    await openPrivateRoom(page);
    await page.selectOption('#mpLapsSel', '5');
    await page.selectOption('#mpAISel', '2');
    const st = await page.evaluate(() => ({ laps: mp.laps, nai: mp.nai, sub: document.getElementById('mpRoomSub').textContent }));
    expect(st.laps).toBe(5);
    expect(st.nai).toBe(2);
    expect(st.sub).toContain('5 laps');
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
