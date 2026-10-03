const { test, expect } = require('@playwright/test');
const path = require('path');

const FILE_URL = 'file://' + path.resolve(__dirname, '../index.html').replace(/\\/g, '/');

const VIEWPORTS = [
  { name: 'Small Mobile (360x740)', width: 360, height: 740 },
  { name: 'iPhone 14 (390x844)', width: 390, height: 844 },
  { name: 'Desktop (800x600)', width: 800, height: 600 }
];

test.describe('Multiplayer Lobby Mobile Optimization & Unified View', () => {

  for (const vp of VIEWPORTS) {
    test(`Multiplayer lobby renders unified view with zero horizontal overflow on ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(FILE_URL);
      await page.evaluate(() => {
        localStorage.clear();
        localStorage.setItem('prstna-dirka', JSON.stringify({ tutSeen: true, introSeen: true, playerName: 'Racer_Mobile' }));
      });
      await page.goto(FILE_URL);
      await page.waitForSelector('#menu.on', { timeout: 10000 });

      // Open multiplayer lobby
      await page.evaluate(() => {
        if (typeof openMP === 'function') openMP();
      });
      await expect(page.locator('#mpHome')).toHaveClass(/on/);

      // Verify all 3 sections (Rooms, Racers, Chat) are visible simultaneously in "All" view
      await expect(page.locator('#mpSectionRooms')).toBeVisible();
      await expect(page.locator('#mpSectionPlayers')).toBeVisible();
      await expect(page.locator('#mpSectionChat')).toBeVisible();

      // Check horizontal overflow on #mpHome and its container
      const overflowCheck = await page.evaluate(() => {
        const home = document.getElementById('mpHome');
        const panel = home ? home.querySelector('.mpPanel') : null;
        const body = document.body;
        const html = document.documentElement;

        const maxScrollW = Math.max(
          home ? home.scrollWidth : 0,
          panel ? panel.scrollWidth : 0,
          body.scrollWidth,
          html.scrollWidth
        );
        const clientW = window.innerWidth;
        return {
          overflows: maxScrollW > clientW + 2,
          maxScrollW,
          clientW
        };
      });

      expect(overflowCheck.overflows, `Horizontal overflow detected: scrollWidth=${overflowCheck.maxScrollW} > clientWidth=${overflowCheck.clientW}`).toBe(false);
    });
  }

  test('Tab filtering switches between All, Rooms, Racers, and Chat', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto(FILE_URL);
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('prstna-dirka', JSON.stringify({ tutSeen: true, introSeen: true, playerName: 'Racer_Test' }));
    });
    await page.goto(FILE_URL);
    await page.waitForSelector('#menu.on', { timeout: 10000 });
    await page.evaluate(() => openMP());

    // Initially in "All" mode: all 3 sections visible
    await expect(page.locator('#mpSectionRooms')).toBeVisible();
    await expect(page.locator('#mpSectionPlayers')).toBeVisible();
    await expect(page.locator('#mpSectionChat')).toBeVisible();

    // Click Rooms tab: only Rooms section visible
    await page.click('#mpTabRooms');
    await expect(page.locator('#mpSectionRooms')).toBeVisible();
    await expect(page.locator('#mpSectionPlayers')).toBeHidden();
    await expect(page.locator('#mpSectionChat')).toBeHidden();

    // Click Racers tab: only Racers section visible
    await page.click('#mpTabPlayers');
    await expect(page.locator('#mpSectionRooms')).toBeHidden();
    await expect(page.locator('#mpSectionPlayers')).toBeVisible();
    await expect(page.locator('#mpSectionChat')).toBeHidden();

    // Click Chat tab: only Chat section visible
    await page.click('#mpTabChat');
    await expect(page.locator('#mpSectionRooms')).toBeHidden();
    await expect(page.locator('#mpSectionPlayers')).toBeHidden();
    await expect(page.locator('#mpSectionChat')).toBeVisible();

    // Click All tab: all 3 visible again
    await page.click('#mpTabAll');
    await expect(page.locator('#mpSectionRooms')).toBeVisible();
    await expect(page.locator('#mpSectionPlayers')).toBeVisible();
    await expect(page.locator('#mpSectionChat')).toBeVisible();
  });

  test('Room Code toggle expands inline entry box', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto(FILE_URL);
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('prstna-dirka', JSON.stringify({ tutSeen: true, introSeen: true, playerName: 'Racer_Test' }));
    });
    await page.goto(FILE_URL);
    await page.waitForSelector('#menu.on', { timeout: 10000 });
    await page.evaluate(() => openMP());

    await expect(page.locator('#mpCodeInline')).toBeHidden();
    await page.click('#btnMpToggleCode');
    await expect(page.locator('#mpCodeInline')).toBeVisible();
    await page.click('#btnMpToggleCode');
    await expect(page.locator('#mpCodeInline')).toBeHidden();
  });

  test('1-Tap Quick Chat Pills and custom message input work smoothly', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto(FILE_URL);
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('prstna-dirka', JSON.stringify({ tutSeen: true, introSeen: true, playerName: 'Racer_Chatter', lang: 'en' }));
    });
    await page.goto(FILE_URL);
    await page.waitForSelector('#menu.on', { timeout: 10000 });
    await page.evaluate(() => openMP());

    // Check quick pills exist
    const pills = page.locator('#mpQuickChatPills .mpQuickPill');
    const count = await pills.count();
    expect(count).toBeGreaterThan(0);

    // Tap first pill (👋 Hi!)
    await pills.first().click();
    await expect(page.locator('#mpLobbyChatMessages .mpChatMsg')).toBeVisible();
    const chatText = await page.locator('#mpLobbyChatMessages').textContent();
    expect(chatText).toContain('Hi!');

    // Wait for rate limit window then send custom message
    await page.waitForTimeout(350);
    await page.fill('#mpChatIn', 'Ready for race!');
    await page.click('#btnMpChatSend');
    await expect(page.locator('#mpLobbyChatMessages')).toContainText('Ready for race!');
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

    // Host creates a room
    await page.evaluate(() => {
      if (typeof mpCreateRoom === 'function') {
        mpCreateRoom({ isPublic: true, track: 0, laps: 3, nai: 0, mode: 'single', voice: false });
      }
    });
    await expect(page.locator('#mpLobby')).toHaveClass(/on/);

    // Click Browse Lobby
    await page.click('#btnMpBrowseLobby');
    await expect(page.locator('#mpHome')).toHaveClass(/on/);

    // Pinned active hosting bar should be visible with return button
    await expect(page.locator('#mpHostingBar')).toBeVisible();

    // Click Return 🏎️ to go back to room
    await page.click('#btnMpReturnRoom');
    await expect(page.locator('#mpLobby')).toHaveClass(/on/);
    await expect(page.locator('#mpLobby .mpRacerCard.me')).toBeVisible();
  });

  test('Quick Join notification toast appears when new room is advertised', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto(FILE_URL);
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('prstna-dirka', JSON.stringify({ tutSeen: true, introSeen: true, playerName: 'Lobby_Watcher' }));
    });
    await page.goto(FILE_URL);
    await page.waitForSelector('#menu.on', { timeout: 10000 });
    await page.evaluate(() => openMP());

    // Simulate incoming MQTT new room message
    await page.evaluate(() => {
      if (typeof mpHandleMqttMessage === 'function') {
        mpHandleMqttMessage('finger-racer/v2/lobby/rooms', {
          id: 'PUB-99999',
          code: '99999',
          title: 'Speed Thunder',
          host: 'Ace_Pilot',
          track: 1,
          laps: 3,
          players: 1,
          max: 4,
          isPublic: true,
          time: Date.now()
        });
      }
    });

    // Quick Join toast should pop up
    await expect(page.locator('#mpQuickJoinToast')).toBeVisible();
    await expect(page.locator('#mpQJTitle')).toContainText('Ace_Pilot');
    await expect(page.locator('#mpQJSub')).toContainText('Speed Thunder');
    await expect(page.locator('#btnMpQJAction')).toBeVisible();
  });

});
