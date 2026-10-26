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

const ME = { tutSeen: true, introSeen: true, playerName: 'Ana', lang: 'en', uid: 'p_ana123', countryFlag: '🇸🇮', claimedBy: 'auth_ana' };

// In-memory stand-in for the compat Firestore API the game uses (collection/doc/where/orderBy/limit/get/set),
// plus stubs for sign-in, buddies and sharing. Documents live in window.__store keyed by full path.
async function installFakes(page, seed = {}) {
  await page.evaluate((seed) => {
    const store = window.__store = Object.assign({}, seed);
    const snapOf = (docs) => ({ size: docs.length, empty: !docs.length, docs, forEach: f => docs.forEach(f) });
    const docSnap = (p) => ({ id: p.split('/').pop(), exists: p in store, data: () => store[p] });
    const query = (colPath, filters, order, lim) => ({
      where: (f, op, v) => query(colPath, filters.concat([[f, op, v]]), order, lim),
      orderBy: (f) => query(colPath, filters, f, lim),
      limit: (n) => query(colPath, filters, order, n),
      get: async () => {
        let docs = Object.keys(store)
          .filter(p => p.startsWith(colPath + '/') && !p.slice(colPath.length + 1).includes('/'))
          .map(docSnap);
        filters.forEach(([f, op, v]) => {
          docs = docs.filter(d => {
            const x = d.data()[f];
            return op === '<' ? x < v : op === '==' ? x === v : op === 'in' ? v.includes(x) : true;
          });
        });
        if (order) docs.sort((a, b) => a.data()[order] - b.data()[order]);
        if (lim) docs = docs.slice(0, lim);
        return snapOf(docs);
      }
    });
    const docRef = (p) => ({
      id: p.split('/').pop(),
      collection: (c) => colRef(p + '/' + c),
      get: async () => docSnap(p),
      set: async (d, o) => { store[p] = Object.assign({}, (o && o.merge && store[p]) || {}, d); },
      update: async (d) => { store[p] = Object.assign({}, store[p] || {}, d); },
      delete: async () => { delete store[p]; }
    });
    const colRef = (p) => Object.assign(query(p, [], null, 0), { doc: (id) => docRef(p + '/' + id) });
    db = { collection: (c) => colRef(c) };
    if (!window.firebase) window.firebase = {};
    if (!firebase.firestore) firebase.firestore = {};
    firebase.firestore.FieldValue = { serverTimestamp: () => 'TS' };

    window.buddyAuthReady = async () => ({ uid: 'auth_ana' });
    window.buddyInviteKey = async () => 'anakey1234567';
    window.__buddies = [];
    window.buddyLoadList = async () => window.__buddies;
    window.__added = null;
    window.buddyAdd = async (id, key) => { window.__added = { id, key }; window.__buddies.push(id); return true; };
    window.__shared = [];
    window.shareInvite = (ctx) => { window.__shared.push(ctx); };
    window.openShareSheet = (ctx) => { window.__shared.push(ctx); };
  }, seed);
}

// A straight-line ghost: one point every 0.05 s for `secs` seconds
function ghostPoints(secs) {
  const g = [];
  for (let t = 0; t <= secs; t += 0.05) g.push({ t: Math.round(t * 1000) / 1000, x: 100 + t * 50, y: 200 + t * 10, a: 0.5, p: t * 60 });
  return g;
}

// Finish the current race at time t (skips the finish camera)
async function finishAt(page, t) {
  await page.evaluate(async ({ t, pts }) => {
    await new Promise(r => setTimeout(r, 300));
    raceTime = t;
    ghostRec = pts;
    finishRace();
    runResults();
  }, { t, pts: ghostPoints(4) });
}

test.describe('Finish screen and challenges', () => {

  test('ghost v2 survives encode/decode, and the week key follows ISO weeks (Monday, UTC)', async ({ page }) => {
    await bootWithSave(page, ME);
    await page.waitForSelector('#menu.on', { timeout: 10000 });
    const r = await page.evaluate((pts) => {
      const g = chDecodeGhost(chEncodeGhost(pts));
      return {
        n: g.length, first: g[0], mid: g[10], last: g[g.length - 1],
        w1: lbWeekKey(Date.UTC(2026, 9, 26, 0, 30)),      // Monday 26 Oct 2026
        w0: lbWeekKey(Date.UTC(2026, 9, 25, 23, 59)),     // Sunday before
        wNy: lbWeekKey(Date.UTC(2027, 0, 1, 12)),         // Friday 1 Jan 2027 → still 2026-W53
        left: lbWeekLeftTxt(Date.UTC(2026, 9, 31, 20, 0)) // Saturday 20:00 → 1d 4h
      };
    }, ghostPoints(10));
    expect(r.first).toEqual({ t: 0, x: 100, y: 200, a: 0.5, p: 0 });
    expect(r.mid.t).toBeCloseTo(1.0, 2);                 // every 2nd sample is kept, with its real time
    expect(r.mid.p).toBe(60);
    expect(r.last.t).toBeGreaterThan(12.9);              // parks on the line 3 s after the finish
    expect(r.w1).toBe('2026-W44');
    expect(r.w0).toBe('2026-W43');
    expect(r.wNy).toBe('2026-W53');
    expect(r.left).toBe('1d 4h');
  });

  test('Single Race results: records first, AI order and stats folded, challenge link shared', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await bootWithSave(page, Object.assign({}, ME, { trackBest: { 2: 82.5 } }));
    await page.waitForSelector('#menu.on', { timeout: 10000 });
    const wk = await page.evaluate(() => lbWeekKey());
    await installFakes(page, {
      'tracks/2/records/p_bob1_70000': { uid: 'p_bob1', name: 'Bob', time: 70 },
      [`tracks/2/weeks/${wk}/times/p_bob1`]: { uid: 'p_bob1', name: 'Bob', time: 75 },
      [`tracks/2/weeks/${wk}/times/p_cid2`]: { uid: 'p_cid2', name: 'Cid', time: 79 }
    });
    await page.evaluate(() => startSingle(1));
    await finishAt(page, 80);

    await expect(page.locator('#results')).toHaveClass(/on/);
    await expect(page.locator('#results')).toHaveClass(/sr/);
    // Hero card with world + this week's place
    await expect(page.locator('#resGlobal .rgRow.wk')).toContainText('This week');
    await expect(page.locator('#resGlobal .rgRow.wk')).toContainText('3rd');
    await expect(page.locator('#resGlobal')).toContainText('behind 2nd (Cid) this week');
    // AI order and details are folded away
    await expect(page.locator('#resRaceHead')).toBeVisible();
    await expect(page.locator('#resRaceHead')).toContainText('Race vs AI');
    await expect(page.locator('#resList')).toBeHidden();
    await expect(page.locator('#resStats')).toBeHidden();
    await page.click('#resRaceHead');
    await expect(page.locator('#resList')).toBeVisible();
    await page.click('#resMoreBtn');
    await expect(page.locator('#resStats')).toBeVisible();
    await expect(page.locator('#resStats')).toContainText('Crashes');
    // Challenge button comes before Race again / Main menu
    const order = await page.evaluate(() => ['btnChallenge', 'btnRetry', 'btnNext', 'resRaceHead']
      .map(id => document.getElementById(id).getBoundingClientRect().top));
    expect(order[0]).toBeLessThan(order[1]);
    expect(order[1]).toBeLessThan(order[2]);
    expect(order[2]).toBeLessThan(order[3]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    expect(overflow).toBe(false);

    await page.click('#btnChallenge');
    await expect.poll(() => page.evaluate(() => window.__shared.length)).toBe(1);
    const res = await page.evaluate(() => {
      const ctx = window.__shared[0];
      const cid = new URL(ctx.url).searchParams.get('ch');
      return { url: ctx.url, text: ctx.text, cid, doc: window.__store['challenges/' + cid], board: save.chBoards[cid] };
    });
    expect(res.cid).toMatch(/^[a-z0-9]{10}$/);
    expect(res.text).toContain('1:20.000');
    expect(res.doc).toMatchObject({ by: 'p_ana123', name: 'Ana', track: 2, time: 80, laps: 5, grid: 2, key: 'anakey1234567', owner: 'auth_ana' });
    expect(res.doc.ghost.length).toBeGreaterThan(100);
    expect(res.board).toMatchObject({ track: 2, best: 80, by: 'p_ana123' });
    // Weekly best was written; sharing the same run again reuses the link
    expect(await page.evaluate((wk) => window.__store[`tracks/2/weeks/${wk}/times/p_ana123`].time, wk)).toBe(80);
    await page.click('#btnChallenge');
    await expect.poll(() => page.evaluate(() => window.__shared.length)).toBe(2);
    expect(await page.evaluate(() => window.__shared[1].url === window.__shared[0].url)).toBe(true);
  });

  test('Challenge link: intro, ghost race from the same grid slot, win → board, buddies, send it back', async ({ page }) => {
    await bootWithSave(page, ME, FILE_URL + '?ch=abcdefgh23&g=p_bob1');
    await page.waitForSelector('#menu.on', { timeout: 10000 });
    expect(await page.evaluate(() => location.search)).not.toContain('ch=');   // link params are cleaned up

    const ghost = await page.evaluate((pts) => chEncodeGhost(pts), ghostPoints(4));
    await installFakes(page, {
      'challenges/abcdefgh23': { by: 'p_bob1', name: 'Bob', flag: '', track: 3, time: 90, laps: 5, grid: 2, ghost, key: 'bobkey1234567' },
      'challenges/abcdefgh23/runs/p_cid2': { uid: 'p_cid2', name: 'Cid', time: 95 }
    });
    await page.evaluate(() => chOpen('abcdefgh23', ''));
    await expect(page.locator('#chModal')).toBeVisible();
    await expect(page.locator('#chTitle')).toContainText('BOB CHALLENGES YOU');
    await expect(page.locator('#chTarget')).toContainText('1:30.000');
    await expect(page.locator('#chBoard')).toContainText('2 racers');

    await page.click('#btnChGo');
    await expect(page.locator('#chModal')).toBeHidden();
    const race = await page.evaluate(() => ({ active: !!chActive, n: NRACERS, ai: racers.length, grid: raceGrid, ghost: ghostPlay && ghostPlay.length, kind: ghostKind, track: curTrack }));
    expect(race).toMatchObject({ active: true, n: 1, ai: 0, grid: 2, kind: 'friend', track: 2 });
    expect(race.ghost).toBeGreaterThan(10);

    await finishAt(page, 88.25);
    await expect(page.locator('#results')).toHaveClass(/ch/);
    await expect(page.locator('#resPlace')).toContainText('YOU WIN');
    await expect(page.locator('#resSub')).toContainText('by 1.750s');
    await expect(page.locator('#resGlobal')).toContainText('3 racers');
    await expect(page.locator('#resGlobal .chRow.me')).toContainText('1:28.250');
    await expect(page.locator('#resGlobal .chRow').first()).toContainText('You');
    await expect(page.locator('#resRaceHead')).toBeHidden();
    const saved = await page.evaluate(() => ({
      run: window.__store['challenges/abcdefgh23/runs/p_ana123'],
      ghost: !!window.__store['challenges/abcdefgh23/ghosts/p_ana123'],
      added: window.__added, careerWins: save.careerWins || 0, trackBest: (save.trackBest || {})[3] || null
    }));
    expect(saved.run).toMatchObject({ uid: 'p_ana123', name: 'Ana', time: 88.25 });
    expect(saved.ghost).toBe(true);
    expect(saved.added).toEqual({ id: 'p_bob1', key: 'bobkey1234567' });
    expect(saved.careerWins).toBe(0);          // challenge wins aren't career wins
    expect(saved.trackBest).toBe(null);        // nor global Single Race records

    await expect(page.locator('#btnChallenge')).toContainText('Send it back');
    await page.click('#btnChallenge');
    const url = await page.evaluate(() => window.__shared[0].url);
    expect(url).toContain('?ch=abcdefgh23&g=p_ana123');

    // Try again restarts the same challenge
    await page.click('#btnRetry');
    expect(await page.evaluate(() => !!chActive && NRACERS === 1)).toBe(true);
  });

  test('Losing a challenge: Try again comes first, sharing second; normal races drop the challenge', async ({ page }) => {
    await bootWithSave(page, ME);
    await page.waitForSelector('#menu.on', { timeout: 10000 });
    const ghost = await page.evaluate((pts) => chEncodeGhost(pts), ghostPoints(4));
    await installFakes(page, { 'challenges/abcdefgh23': { by: 'p_bob1', name: 'Bob', track: 1, time: 60, laps: 5, grid: 2, ghost } });
    await page.evaluate(async () => { startChallengeRace(await chLoad('abcdefgh23', '')); });
    await finishAt(page, 60.5);
    await expect(page.locator('#resPlace')).toContainText('SO CLOSE');
    await expect(page.locator('#resSub')).toContainText('0.500s faster');
    await expect(page.locator('#btnChallenge')).toContainText('Share this challenge');
    const tops = await page.evaluate(() => ['btnRetry', 'btnChallenge'].map(id => document.getElementById(id).getBoundingClientRect().top));
    expect(tops[0]).toBeLessThan(tops[1]);
    await page.evaluate(() => startSingle(0));
    expect(await page.evaluate(() => ({ ch: chActive, n: NRACERS }))).toEqual({ ch: null, n: 6 });
  });

  test('Leaderboard: All time / This week switch and the ⚔️ Challenge footer button', async ({ page }) => {
    await bootWithSave(page, Object.assign({}, ME, { trackBest: { 1: 70 } }));
    await page.waitForSelector('#menu.on', { timeout: 10000 });
    const wk = await page.evaluate(() => lbWeekKey());
    await page.evaluate((wk) => { save.weekBest = { 1: { wk, t: 72, synced: true } }; localStorage.setItem('fr_pbGhosts', JSON.stringify({ 1: { time: 70, g: chEncodeGhost([{ t: 0, x: 1, y: 1, a: 0, p: 0 }, { t: 0.05, x: 2, y: 1, a: 0, p: 1 }]) } })); }, wk);
    await installFakes(page, {
      'tracks/1/records/p_bob1_65000': { uid: 'p_bob1', name: 'Bob', time: 65 },
      'tracks/1/records/p_ana123_70000': { uid: 'p_ana123', name: 'Ana', time: 70 },
      [`tracks/1/weeks/${wk}/times/p_cid2`]: { uid: 'p_cid2', name: 'Cid', time: 71 },
      [`tracks/1/weeks/${wk}/times/p_ana123`]: { uid: 'p_ana123', name: 'Ana', time: 72 }
    });
    await page.evaluate(() => { currentLbTrack = 1; openLeaderboard('single'); });
    await expect(page.locator('#lbPeriod')).toBeVisible();
    await expect(page.locator('#lbHint')).toBeHidden();
    await expect(page.locator('#btnLbShare')).toContainText('Challenge');
    await expect(page.locator('#lbList .lbRow')).toHaveCount(2);
    await expect(page.locator('#lbList .lbRow').first()).toContainText('Bob');

    await page.click('#btnLbWeek');
    await expect(page.locator('#btnLbWeek')).toHaveClass(/on/);
    await expect(page.locator('#lbResetIn')).toContainText('Resets in');
    await expect(page.locator('#lbList .lbRow').first()).toContainText('Cid');
    await expect(page.locator('#lbList .lbRow.me')).toContainText('1:12.000');
    await expect(page.locator('#lbMine')).toContainText('this week');

    await page.click('#btnLbShare');
    await expect.poll(() => page.evaluate(() => window.__shared.length)).toBe(1);
    expect(await page.evaluate(() => window.__shared[0].url)).toContain('?ch=');

    // Other tabs keep their hint line and footer
    await page.evaluate(() => openLeaderboard('wc'));
    await expect(page.locator('#lbPeriod')).toBeHidden();
    await expect(page.locator('#lbHint')).toBeVisible();
    await page.evaluate(() => openLeaderboard('buddies'));
    await expect(page.locator('#btnLbShare')).toContainText('Invite buddy');
  });

  test('Someone beating me on a challenge board shows a "Race back" toast once', async ({ page }) => {
    await bootWithSave(page, ME);
    await page.waitForSelector('#menu.on', { timeout: 10000 });
    await installFakes(page, {
      'challenges/abcdefgh23/runs/p_cid2': { uid: 'p_cid2', name: 'Cid', time: 79.2 },
      'challenges/abcdefgh23/runs/p_dan3': { uid: 'p_dan3', name: 'Dan', time: 85 }
    });
    await page.evaluate(() => {
      $("buddyToast").style.display = "none";
      save.chBoards = { abcdefgh23: { track: 2, by: 'p_ana123', name: 'Ana', best: 80, ts: Date.now() } };
      window.__opened = null;
      window.chOpen = (cid, g) => { window.__opened = { cid, g }; };
    });
    await page.evaluate(() => chCheckBeaten());
    await expect(page.locator('#buddyToast')).toBeVisible();
    await expect(page.locator('#buddyToastTitle')).toContainText('Cid');
    await expect(page.locator('#buddyToastTitle')).toContainText('beat your challenge');
    await expect(page.locator('#buddyToastSub')).toContainText('−0.80s');
    await page.click('#btnBuddyToastGo');
    expect(await page.evaluate(() => window.__opened)).toEqual({ cid: 'abcdefgh23', g: 'p_cid2' });
    // Already told: no second toast
    await page.evaluate(() => { $("buddyToast").style.display = "none"; return chCheckBeaten(); });
    await expect(page.locator('#buddyToast')).toBeHidden();
  });
});
