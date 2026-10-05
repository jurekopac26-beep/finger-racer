const { test, expect } = require('@playwright/test');
const path = require('path');

const FILE_URL = 'file://' + path.resolve(__dirname, '../index.html').replace(/\\/g, '/');

test.describe('World Cup Standardized Laps & Cumulative Time Leaderboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(FILE_URL);
    await page.evaluate(() => {
      localStorage.clear();
      const s = {
        tutSeen: true,
        introSeen: true,
        lang: 'en',
        sound: false,
        diffMode: 'easy',
        diff: 0
      };
      localStorage.setItem('prstna-dirka', JSON.stringify(s));
    });
    await page.goto(FILE_URL);
    await page.waitForSelector('#menu.on', { timeout: 10000 });
  });

  test('World Cup sets standard 5 laps for tracks', async ({ page }) => {
    const laps = await page.evaluate(() => {
      // Initialize WC state
      wc = {
        name: "Speedy",
        race: 0,
        order: [0, 1, 2, 3, 4, 5, 6],
        pts: [0, 0, 0, 0, 0, 0],
        ents: [],
        recs: [],
        done: 0,
        stats: { pits: 0, dmg: 0, draftRep: 0, pitRep: 0, wins: 0, podiums: 0, crashes: 0, bestLap: null, bestLapName: null, bestTime: null, bestPos: 99 }
      };
      startLevel(1);
      return LAPS;
    });
    expect(laps).toBe(5);
  });

  test('showWCStand calculates total cumulative time and saves to leaderboard', async ({ page }) => {
    const savedLb = await page.evaluate(() => {
      save.leaderboard = [];
      save.playerName = "Champion";
      wc = {
        name: "Champion",
        race: 6,
        order: [0, 1, 2, 3, 4, 5, 6],
        pts: [10, 10, 10, 10, 10, 175],
        ents: [
          { name: "AI 1", color: "#f00", me: false },
          { name: "AI 2", color: "#0f0", me: false },
          { name: "AI 3", color: "#00f", me: false },
          { name: "AI 4", color: "#ff0", me: false },
          { name: "AI 5", color: "#0ff", me: false },
          { name: "Champion", color: "#3dff8e", me: true }
        ],
        recs: [
          { time: 60.123, pos: 1, gained: 25, track: 0 },
          { time: 62.456, pos: 1, gained: 25, track: 1 },
          { time: 58.789, pos: 1, gained: 25, track: 2 },
          { time: 65.111, pos: 1, gained: 25, track: 3 },
          { time: 61.222, pos: 1, gained: 25, track: 4 },
          { time: 59.333, pos: 1, gained: 25, track: 5 },
          { time: 63.444, pos: 1, gained: 25, track: 6 }
        ],
        savedToLb: false,
        stats: { pits: 1, dmg: 0.1, draftRep: 0.05, pitRep: 0.05, wins: 7, podiums: 7, crashes: 0, bestLap: 11.2, bestLapName: "Champion", bestTime: 58.789, bestPos: 1 }
      };

      showWCStand(true, [0, 0, 0, 0, 0, 25]);
      return save.leaderboard;
    });

    expect(savedLb.length).toBe(1);
    expect(savedLb[0].name).toBe("Champion");
    expect(savedLb[0].pts).toBe(175);
    expect(savedLb[0].allFinished).toBe(true);
    // 60.123 + 62.456 + 58.789 + 65.111 + 61.222 + 59.333 + 63.444 = 430.478
    expect(savedLb[0].totalTime).toBeCloseTo(430.478, 2);
  });

  test('openLeaderboard renders total time, points badge, and personal best', async ({ page }) => {
    const lbRender = await page.evaluate(() => {
      save.playerName = "FastGuy";
      save.lang = "en";
      save.leaderboard = [
        { name: "FastGuy", pts: 175, totalTime: 420.5, allFinished: true, diffMode: "hard", diff: 1, ts: Date.now() },
        { name: "SlowerGuy", pts: 175, totalTime: 435.2, allFinished: true, diffMode: "hard", diff: 1, ts: Date.now() },
        { name: "LegacyPlayer", pts: 150, diffMode: "easy", diff: 0, ts: Date.now() }
      ];

      openLeaderboard("wc");

      const rows = Array.from(document.querySelectorAll("#lbList .lbRow")).map(r => ({
        name: r.querySelector(".lbNm") ? r.querySelector(".lbNm").textContent.trim() : "",
        sub: r.querySelector(".lbSub") ? r.querySelector(".lbSub").textContent.trim() : "",
        time: r.querySelector(".lbTm") ? r.querySelector(".lbTm").textContent.trim() : ""
      }));

      const hint = document.getElementById("lbHint") ? document.getElementById("lbHint").textContent : "";
      const mine = document.getElementById("lbMine") ? document.getElementById("lbMine").textContent : "";

      return { rows, hint, mine };
    });

    expect(lbRender.hint).toContain("Total time");
    expect(lbRender.rows.length).toBe(3);

    // 1st place: FastGuy (420.5s = 07:00.500)
    expect(lbRender.rows[0].name).toContain("FastGuy");
    expect(lbRender.rows[0].sub).toContain("175 🏆");
    expect(lbRender.rows[0].sub).toContain("Hard ⚡");
    expect(lbRender.rows[0].time).toMatch(/(07|7):00\.500/);

    // 2nd place: SlowerGuy (435.2s = 7:15.200)
    expect(lbRender.rows[1].name).toContain("SlowerGuy");
    expect(lbRender.rows[1].sub).toContain("175 🏆");
    expect(lbRender.rows[1].time).toMatch(/(07|7):15\.200/);

    // 3rd place: Legacy entry with points only
    expect(lbRender.rows[2].name).toContain("LegacyPlayer");
    expect(lbRender.rows[2].time).toContain("150 🏆");

    // Personal best in lbMine
    expect(lbRender.mine).toContain("Your best Cup time");
    expect(lbRender.mine).toMatch(/(07|7):00\.500/);
  });
});
