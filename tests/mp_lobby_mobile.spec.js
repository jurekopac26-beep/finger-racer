const { test, expect } = require('@playwright/test');
const path = require('path');

const FILE_URL = 'file://' + path.resolve(__dirname, '../index.html').replace(/\\/g, '/');

// THE AGREED LOBBY DESIGN (do not bring back the old tabbed lobby to make a test pass):
//  - NO tabs (All / Rooms / Racers / Chat) and NO quick-chat buttons ("Hi!", "Who's racing?", …)
//  - rooms list (with the "Lobby" entry at the top when nothing is selected) + racers of the selected room
//  - lobby chat is a dock at the bottom (collapsed bar that opens upward), typed text only
const VIEWPORTS = [
  { name: 'Small Mobile (360x740)', width: 360, height: 740 },
  { name: 'iPhone 14 (390x844)', width: 390, height: 844 },
  { name: 'Desktop (800x600)', width: 800, height: 600 }
];

async function openLobby(page, vp, name = 'Racer_Mobile') {
  await page.setViewportSize({ width: vp.width, height: vp.height });
  await page.goto(FILE_URL);
  await page.evaluate((n) => {
    localStorage.clear();
    localStorage.setItem('prstna-dirka', JSON.stringify({ tutSeen: true, introSeen: true, playerName: n, lang: 'en' }));
  }, name);
  await page.goto(FILE_URL);
  await page.waitForSelector('#menu.on', { timeout: 10000 });
  await page.evaluate(() => openMP());
  await expect(page.locator('#mpHome')).toHaveClass(/on/);
}

test.describe('Multiplayer lobby: rooms + racers + chat dock (no tabs)', () => {

  for (const vp of VIEWPORTS) {
    test(`Lobby shows rooms and the chat dock, has no tabs or quick-chat buttons, and no horizontal overflow on ${vp.name}`, async ({ page }) => {
      await openLobby(page, vp);

      await expect(page.locator('#mpRoomList')).toBeVisible();
      await expect(page.locator('#mpChatDock')).toBeVisible();
      await expect(page.locator('#mpChatDockBar')).toBeVisible();

      // The old design must not come back
      await expect(page.locator('.mpTab, #mpTabAll, #mpTabRooms, #mpTabPlayers, #mpTabChat')).toHaveCount(0);
      await expect(page.locator('#mpQuickChatPills, .mpQuickChatPills, .mpQCPill')).toHaveCount(0);
      expect(await page.locator('#mpHome').innerText()).not.toMatch(/Who's racing\?|Kdo za dirko\?/);

      const overflow = await page.evaluate(() => {
        const home = document.getElementById('mpHome');
        const panel = home.querySelector('.mpPanel');
        const maxScrollW = Math.max(home.scrollWidth, panel.scrollWidth, document.body.scrollWidth, document.documentElement.scrollWidth);
        return { overflows: maxScrollW > window.innerWidth + 2, maxScrollW, clientW: window.innerWidth };
      });
      expect(overflow.overflows, `Horizontal overflow: scrollWidth=${overflow.maxScrollW} > ${overflow.clientW}`).toBe(false);
    });
  }

  test('Desktop shows rooms (left) next to racers of the selected room (right)', async ({ page }) => {
    await openLobby(page, { width: 900, height: 700 });
    const cols = await page.evaluate(() => {
      const a = document.querySelector('.mpBrowseCol').getBoundingClientRect();
      const b = document.querySelector('.mpDetailCol').getBoundingClientRect();
      return { roomsLeft: a.left, racersLeft: b.left, sameRow: Math.abs(a.top - b.top) < 4 };
    });
    expect(cols.sameRow).toBe(true);
    expect(cols.roomsLeft).toBeLessThan(cols.racersLeft);
  });

  test('The "Lobby" entry is at the top of the rooms list when no room is open', async ({ page }) => {
    await openLobby(page, { width: 900, height: 700 });
    await page.evaluate(() => mpRenderLobbyUI());
    const first = page.locator('#mpRoomList > *').first();
    await expect(first).toContainText(/Lobby|Lobi/);
  });

  test('Chat dock opens from the bottom bar and sends typed messages', async ({ page }) => {
    await openLobby(page, { width: 390, height: 844 }, 'Chat_Tester');
    await page.click('#mpChatDockBar');
    await expect(page.locator('#mpChatDock')).toHaveClass(/open/);
    await page.fill('#mpChatIn', 'Ready for race!');
    await page.click('#btnMpChatSend');
    await expect(page.locator('#mpLobbyChatMessages')).toContainText('Ready for race!');
    await page.click('#mpChatDockBar');
    await expect(page.locator('#mpChatDock')).not.toHaveClass(/open/);
  });

  test('Browse Lobby while hosting keeps room alive and displays active host banner', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto(FILE_URL);
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('prstna-dirka', JSON.stringify({ tutSeen: true, introSeen: true, playerName: 'Host_Pro' }));
    });
    await page.goto(FILE_URL);
    await page.waitForSelector('#menu.on', { timeout: 10000 });
    await page.evaluate(() => mpCreateRoom({ isPublic: true, track: 0, laps: 3, nai: 0, mode: 'single', voice: false }));
    await expect(page.locator('#mpLobby')).toHaveClass(/on/);
    await page.click('#btnMpBrowseLobby');
    await expect(page.locator('#mpHome')).toHaveClass(/on/);
    await expect(page.locator('#mpHostingBar')).toBeVisible();
    await page.click('#btnMpReturnRoom');
    await expect(page.locator('#mpLobby')).toHaveClass(/on/);
    await expect(page.locator('#mpLobby .mpRacerCard.me')).toBeVisible();
  });

  test('Quick Join notification toast appears when new room is advertised', async ({ page }) => {
    await openLobby(page, { width: 360, height: 740 }, 'Lobby_Watcher');
    await page.evaluate(() => {
      mpHandleMqttMessage('finger-racer/v2/lobby/rooms', {
        id: 'PUB-99999', code: '99999', title: 'Speed Thunder', host: 'Ace_Pilot',
        track: 1, laps: 3, players: 1, max: 4, isPublic: true, time: Date.now()
      });
    });
    await expect(page.locator('#mpQuickJoinToast')).toBeVisible();
    await expect(page.locator('#mpQJTitle')).toContainText('Ace_Pilot');
    await expect(page.locator('#mpQJSub')).toContainText('Speed Thunder');
    await expect(page.locator('#btnMpQJAction')).toBeVisible();
  });
});
