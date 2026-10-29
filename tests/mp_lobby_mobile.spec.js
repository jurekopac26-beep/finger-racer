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

  test('Multiplayer finish signaling: timer chip count, 2nd finisher announcement, and gap clearing', async ({ page }) => {
    await openLobby(page, { width: 800, height: 600 }, 'Racer_Me');
    await page.evaluate(() => {
      mpCreateRoom({ isPublic: true, track: 0, laps: 3, nai: 0, mode: 'single', voice: false });
      mpOnData({ t: 'join', sender: 'peer-1', name: 'TurboMax', color: '#ff3366' });
      mpOnData({ t: 'join', sender: 'peer-2', name: 'ApexKing', color: '#33ccff' });
      mpStartRace(true);
      state = 'racing';
      raceTime = 35.0;
      mpOnData({ t: 'pos', sender: 'peer-1', x: 200, y: 200, a: 0, p: 2500, s: 400, crossings: 3, dmg: 0 });
      mpOnData({ t: 'pos', sender: 'peer-2', x: 180, y: 200, a: 0, p: 1800, s: 300, crossings: 2, dmg: 0 });
      drawMpOpp(document.querySelector('canvas').getContext('2d'));
    });

    // Initially racing peers produce a non-null gap
    const initialGap = await page.evaluate(() => mp.gap);
    expect(initialGap).not.toBeNull();

    // 1st opponent finishes
    await page.evaluate(() => {
      mpOnData({ t: 'fin', sender: 'peer-1', time: 33.45 });
      updateHUD(true);
    });

    await expect(page.locator('#mpEndTimerChip')).toBeVisible();
    await expect(page.locator('#mpEndTimerChip')).toContainText('🏁 1/3 in goal');
    await expect(page.locator('#standings')).toContainText('🏁 #1');

    // 2nd opponent finishes — banner should announce #2 and chip should show 2/3
    await page.evaluate(() => {
      mpOnData({ t: 'fin', sender: 'peer-2', time: 36.12 });
      drawMpOpp(document.querySelector('canvas').getContext('2d'));
      updateHUD(true);
    });

    await expect(page.locator('#mpEndTimerChip')).toContainText('🏁 2/3 in goal');
    await expect(page.locator('#banner')).toContainText('ApexKing finished #2');
    // Since all opponents have now finished, mp.gap should be cleared to null
    const gapAfterAllOppsDone = await page.evaluate(() => mp.gap);
    expect(gapAfterAllOppsDone).toBeNull();
  });

  test('Waiting for opponents overlay (#mpWaitFinishCard) appears when local player finishes first and hides when all finish', async ({ page }) => {
    await openLobby(page, { width: 800, height: 600 }, 'SpeedHero');
    await page.evaluate(() => {
      mpCreateRoom({ isPublic: true, track: 0, laps: 3, nai: 0, mode: 'single', voice: false });
      mpOnData({ t: 'join', sender: 'peer-1', name: 'SlowPoke', color: '#ff9900' });
      mpStartRace(true);
      state = 'racing';
      raceTime = 41.25;
      mpOnData({ t: 'pos', sender: 'peer-1', x: 150, y: 150, a: 0, p: 1200, s: 200, crossings: 2, dmg: 0 });
      mpFinish();
    });

    await expect(page.locator('#mpWaitFinishCard')).toBeVisible();
    await expect(page.locator('#mpWaitFinishCard')).toContainText('YOU FINISHED #1');
    await expect(page.locator('#mpWaitFinishCard')).toContainText('SlowPoke');
    await expect(page.locator('#mpWaitFinishCard')).toContainText('Lap 2/3');
    await expect(page.locator('#hTime')).toContainText('🏁');

    // Now the remaining opponent crosses the finish line
    await page.evaluate(() => {
      mpOnData({ t: 'fin', sender: 'peer-1', time: 45.80 });
    });

    await expect(page.locator('#mpWaitFinishCard')).toBeHidden();
    await expect(page.locator('#results')).toHaveClass(/on/);
  });

  test('Multiplayer track picker modal (#mpTrackPickModal) allows touchmove scrolling and scrolls through all tracks on mobile', async ({ page }) => {
    await openLobby(page, { width: 360, height: 640 }, 'Track_Picker_Tester');
    await page.evaluate(() => {
      mpCreateRoom({ isPublic: true, track: 0, laps: 3, nai: 0, mode: 'single', voice: false });
    });
    await expect(page.locator('#mpLobby')).toHaveClass(/on/);

    // Click the track button in host settings to open #mpTrackPickModal
    await page.click('#mpTracks .mpTrackBtn');
    await expect(page.locator('#mpTrackPickModal')).toBeVisible();

    const scrollCheck = await page.evaluate(() => {
      const box = document.getElementById('mpTrackPickCards');
      const style = window.getComputedStyle(box);
      // Dispatch a cancelable touchmove event inside #mpTrackPickCards and verify it is NOT preventDefault()-ed
      const ev = new Event('touchmove', { bubbles: true, cancelable: true });
      const notPrevented = box.dispatchEvent(ev);
      const canScroll = box.scrollHeight > box.clientHeight;
      box.scrollTop = 120;
      return {
        notPrevented,
        DefaultPrevented: ev.defaultPrevented,
        touchAction: style.touchAction,
        overflowY: style.overflowY,
        canScroll,
        scrolledTop: box.scrollTop
      };
    });

    expect(scrollCheck.DefaultPrevented).toBe(false);
    expect(scrollCheck.notPrevented).toBe(true);
    expect(scrollCheck.touchAction).toContain('pan-y');
    expect(scrollCheck.overflowY).toBe('auto');
    expect(scrollCheck.canScroll).toBe(true);
    expect(scrollCheck.scrolledTop).toBeGreaterThan(0);
  });

  test('Multiplayer invite link (?room=CODE) connects across PUB/PRIV mismatch, handles retained room_state while host is away, and wakes up on host_here', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(FILE_URL);
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('prstna-dirka', JSON.stringify({ tutSeen: true, introSeen: true, playerName: 'Invited_Friend', lang: 'en' }));
    });

    // Navigate with ?room=ABCDE (note: no &pub=1 even though the host's room is PUB-ABCDE)
    await page.goto(FILE_URL + '?room=ABCDE');
    await expect(page.locator('#mpLobby')).toHaveClass(/on/, { timeout: 10000 });

    // Verify both PUB-ABCDE and PRIV-ABCDE topics are registered for subscription
    const topics = await page.evaluate(() => mpRelay.currentRoomTopics);
    expect(topics).toContain('finger-racer/v2/room/PUB-ABCDE/#');
    expect(topics).toContain('finger-racer/v2/room/PRIV-ABCDE/#');

    // Simulate retained room_state arriving from PUB-ABCDE while host is still in WhatsApp
    await page.evaluate(() => {
      mpHandleMqttMessage('finger-racer/v2/room/PUB-ABCDE/state', {
        t: 'room_state',
        sender: 'host-999',
        roomId: 'PUB-ABCDE',
        code: 'ABCDE',
        isPublic: true,
        name: 'HostMatej',
        color: '#3dff8e',
        roomTitle: 'Matej Championship',
        track: 2,
        laps: 5,
        nai: 2,
        mode: 'single',
        closed: false,
        time: Date.now()
      });
    });

    await expect(page.locator('#mpRoomHeading')).toContainText('Matej Championship');
    await expect(page.locator('#mpStatus')).toContainText('HostMatej');

    // Now simulate host returning to the game and sending welcome on PUB-ABCDE
    await page.evaluate(() => {
      mpHandleMqttMessage('finger-racer/v2/room/PUB-ABCDE/msg/host-999', {
        t: 'welcome',
        sender: 'host-999',
        to: MP_CLIENT_ID,
        roomId: 'PUB-ABCDE',
        isPublic: true,
        code: 'ABCDE',
        name: 'HostMatej',
        color: '#3dff8e',
        roomTitle: 'Matej Championship',
        track: 2,
        laps: 5,
        nai: 2,
        ready: true,
        peers: []
      });
    });

    await expect(page.locator('#mpStatus')).toContainText('Connected to room: HostMatej ✅');
    const hostConnected = await page.evaluate(() => ({ hostId: mp.hostId, roomId: mp.roomId, isPublic: mp.isPublic }));
    expect(hostConnected.hostId).toBe('host-999');
    expect(hostConnected.roomId).toBe('PUB-ABCDE');
    expect(hostConnected.isPublic).toBe(true);
  });
});

