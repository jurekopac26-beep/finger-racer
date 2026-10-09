const { test, expect } = require('@playwright/test');
const path = require('path');

const FILE_URL = 'file://' + path.resolve(__dirname, '../index.html').replace(/\\/g, '/');
const ME = { tutSeen: true, introSeen: true, playerName: 'Ana', lang: 'en', uid: 'p_ana123' };
const P = 'finger-racer/v2/buddy/';

async function boot(page, vp = { width: 390, height: 844 }) {
  await page.setViewportSize(vp);
  await page.goto(FILE_URL);
  await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('prstna-dirka', JSON.stringify(s)); }, ME);
  await page.goto(FILE_URL);
  await page.waitForSelector('#menu.on', { timeout: 10000 });
  // Network is simulated: buddies list + a fake connected relay that records what we publish
  await page.evaluate(() => {
    _buddyIds = ['p_bob1', 'p_cid2'];
    save.buddyCache = { p_bob1: { name: 'Bob' }, p_cid2: { name: 'Cid' } };
    window.buddyLoadList = async () => _buddyIds;
    window.__pub = [];
    buddyNet.connected = true;
    buddyNet.client = { send: (m) => window.__pub.push({ topic: m.destinationName, data: JSON.parse(m.payloadString), retained: m.retained }), subscribe() {} };
  });
}

const presence = (page, id, st, ageMs = 0, off = false) =>
  page.evaluate(({ P, id, st, ageMs, off }) => buddyNetHandle(P + 'p/' + id, off ? { id, off: true, t: Date.now() } : { id, name: id, st, t: Date.now() - ageMs }), { P, id, st, ageMs, off });

test.describe('Buddies online + challenges', () => {

  test('Lobby strip shows who is online, with a challenge button only for online buddies', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => openMP());
    await presence(page, 'p_bob1', 'menu');
    const strip = page.locator('#mpBuddyStrip');
    await expect(strip).toContainText('1 online');
    await expect(strip.locator('.mbsChip.on')).toHaveCount(1);
    await expect(strip.locator('.mbsChip.on')).toContainText('Bob');
    await expect(strip.locator('.mbsGo')).toHaveCount(1);
    await expect(strip.locator('.mbsChip:not(.on)')).toContainText('Offline');   // Cid
    // Menu badge
    expect(await page.locator('#mbBuddyBadge').textContent()).toContain('1');
  });

  test('Stale or "off" presence counts as offline; racing buddies can\'t be challenged', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => openMP());
    await presence(page, 'p_bob1', 'menu', 120000);           // last heartbeat 2 min ago
    await expect(page.locator('#mpBuddyStrip')).toContainText('0 online');
    await presence(page, 'p_cid2', 'racing');
    await expect(page.locator('#mpBuddyStrip .mbsGo')).toBeDisabled();
    await presence(page, 'p_cid2', '', 0, true);               // went offline (will message)
    await expect(page.locator('#mpBuddyStrip')).toContainText('0 online');
    // Strangers' presence is ignored
    await presence(page, 'p_stranger9', 'menu');
    await expect(page.locator('#mpBuddyStrip .mbsChip')).toHaveCount(2);
  });

  test('⚔️ Challenge creates a private room and sends the code to the buddy\'s inbox', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => openMP());
    await presence(page, 'p_bob1', 'lobby');
    await page.click('#mpBuddyStrip .mbsGo');
    await expect(page.locator('#mpLobby')).toHaveClass(/on/);
    const r = await page.evaluate(() => ({ code: mp.code, isPublic: mp.isPublic, host: mp.isHost, pub: window.__pub }));
    expect(r.host).toBe(true);
    expect(r.isPublic).toBe(false);
    const ch = r.pub.find(m => m.topic === 'finger-racer/v2/buddy/in/p_bob1');
    expect(ch).toBeTruthy();
    expect(ch.data).toMatchObject({ t: 'challenge', from: 'p_ana123', code: r.code, pub: false });
    expect(ch.retained).toBe(false);
    // Presence never carries a room code
    r.pub.filter(m => m.topic.startsWith('finger-racer/v2/buddy/p/')).forEach(m => expect(JSON.stringify(m.data)).not.toContain(r.code));
  });

  test('Receiving a challenge from a buddy shows Join, which joins that room', async ({ page }) => {
    await boot(page);
    await page.evaluate((P) => buddyNetHandle(P + 'in/p_ana123', { t: 'challenge', from: 'p_bob1', name: 'Bob', code: 'ABCDE', pub: false, track: 0, ts: Date.now() }), P);
    await expect(page.locator('#buddyToast')).toBeVisible();
    await expect(page.locator('#buddyToastTitle')).toContainText('Bob');
    await expect(page.locator('#buddyToastTitle')).toContainText('challenges you');
    await page.click('#btnBuddyToastGo');
    await expect(page.locator('#mpLobby')).toHaveClass(/on/);
    expect(await page.evaluate(() => mp.roomId)).toBe('PRIV-ABCDE');
  });

  test('Challenges from strangers or old challenges are ignored', async ({ page }) => {
    await boot(page);
    await page.evaluate((P) => {
      buddyNetHandle(P + 'in/p_ana123', { t: 'challenge', from: 'p_stranger9', code: 'ZZZZZ', ts: Date.now() });
      buddyNetHandle(P + 'in/p_ana123', { t: 'challenge', from: 'p_bob1', code: 'OLD11', ts: Date.now() - 10 * 60000 });
    }, P);
    await page.waitForTimeout(300);
    await expect(page.locator('#buddyToast')).toBeHidden();
  });

  test('My presence reflects what I am doing', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { window.__pub = []; buddyNetAnnounce(); });
    let last = await page.evaluate(() => window.__pub.pop());
    expect(last.topic).toBe('finger-racer/v2/buddy/p/p_ana123');
    expect(last.retained).toBe(true);
    expect(last.data.st).toBe('menu');
    await page.evaluate(() => { openMP(); window.__pub = []; buddyNetAnnounce(); });
    last = await page.evaluate(() => window.__pub.pop());
    expect(last.data.st).toBe('lobby');
  });

  test('Lobby with the buddies strip still fits at 360px', async ({ page }) => {
    await boot(page, { width: 360, height: 740 });
    await page.evaluate(() => openMP());
    await presence(page, 'p_bob1', 'menu');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    expect(overflow).toBe(false);
  });
});
