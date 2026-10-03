const { test, expect } = require('@playwright/test');
const path = require('path');

const FILE_URL = 'file://' + path.resolve(__dirname, '../index.html').replace(/\\/g, '/');

test.describe('Ghost Racer & Help System Integration', () => {

  test.beforeEach(async ({ page }) => {
    // Navigate and set localStorage state
    await page.goto(FILE_URL);
    await page.evaluate(() => {
      localStorage.clear();
      const s = {
        tutSeen: true,
        introSeen: true,
        freemiumMode: true,
        lang: 'en',
        sound: false,
        ghostMode: 'off'
      };
      localStorage.setItem('prstna-dirka', JSON.stringify(s));
    });
    // Reload page with new save state
    await page.goto(FILE_URL);
    // Ensure menu screen is active
    await page.waitForSelector('#menu.on', { timeout: 10000 });
  });

  test('Menu has Help "?" button and opens interactive intro then help screen', async ({ page }) => {
    const helpBtn = page.locator('#btnMenuHelp');
    await expect(helpBtn).toBeVisible();
    await expect(helpBtn.locator('.helpBtnInner')).toHaveText('?');

    // Click help button
    await helpBtn.click();

    // Verify interactive intro is shown first
    const introScreen = page.locator('#intro');
    await expect(introScreen).toHaveClass(/on/);
    await expect(introScreen.locator('.islide[data-i="0"]')).toHaveClass(/on/);

    // Skip intro to navigate to instructions
    await page.locator('#btnIntroSkip').click();

    // Verify help screen is shown
    const helpScreen = page.locator('#help');
    await expect(helpScreen).toHaveClass(/on/);

    // Verify help body has instructions
    const helpBody = page.locator('#helpBody');
    await expect(helpBody).toBeVisible();
    await expect(helpBody).toContainText('Place your finger on the marked circle');

    // Verify Replay Intro and Back buttons exist
    const replayBtn = page.locator('#btnHelpReplayIntro');
    await expect(replayBtn).toBeVisible();
    await expect(replayBtn).toContainText('Interactive Intro');

    // Click Back to return to menu
    await page.locator('#btnBack2').click();
    const menuScreen = page.locator('#menu');
    await expect(menuScreen).toHaveClass(/on/);
  });

  test('Replaying Interactive Intro from Help returns to Help screen', async ({ page }) => {
    // Navigate from menu ? button to intro, then skip to help
    await page.locator('#btnMenuHelp').click();
    await expect(page.locator('#intro')).toHaveClass(/on/);
    await page.locator('#btnIntroSkip').click();
    await expect(page.locator('#help')).toHaveClass(/on/);

    // Click Interactive Intro
    await page.locator('#btnHelpReplayIntro').click();
    const introScreen = page.locator('#intro');
    await expect(introScreen).toHaveClass(/on/);

    // Verify first slide is visible and localized in English
    const firstSlide = introScreen.locator('.islide[data-i="0"]');
    await expect(firstSlide).toHaveClass(/on/);
    await expect(firstSlide.locator('.ititle')).toHaveText('Drive with your finger');

    // Skip intro
    await page.locator('#btnIntroSkip').click();

    // Must return to Help screen, NOT main menu
    await expect(page.locator('#help')).toHaveClass(/on/);
    await expect(page.locator('#menu')).not.toHaveClass(/on/);
  });

  test('Bilingual localization of Help & Intro (Slovenian)', async ({ page }) => {
    // Switch language to Slovenian
    await page.evaluate(() => {
      window.applyLang('sl');
      window.save.lang = 'sl';
      window.persist();
    });

    // Go to Help via ? (opens intro first)
    await page.locator('#btnMenuHelp').click();
    const introScreen = page.locator('#intro');
    await expect(introScreen).toHaveClass(/on/);
    const firstSlide = introScreen.locator('.islide[data-i="0"]');
    await expect(firstSlide).toHaveText(/Vozi s prstom/);

    // Skip to Help screen
    await page.locator('#btnIntroSkip').click();
    await expect(page.locator('#help')).toHaveClass(/on/);

    // Verify Slovenian text in helpBody
    const helpBody = page.locator('#helpBody');
    await expect(helpBody).toContainText('Postavi prst na označeni krog');

    // Verify Slovenian text on Replay button
    const replayBtn = page.locator('#btnHelpReplayIntro');
    await expect(replayBtn).toContainText('Interaktivni uvod');

    // Open Intro and verify Slovenian slide text
    await replayBtn.click();
    await expect(introScreen).toHaveClass(/on/);
    await expect(firstSlide).toHaveText(/Vozi s prstom/);

    // Advance to end and finish intro
    for (let i = 0; i < 4; i++) {
      await page.waitForTimeout(200);
      await page.locator('#btnIntroNext').click();
    }
    const lastSlide = introScreen.locator('.islide[data-i="4"]');
    await expect(lastSlide).toHaveClass(/on/);
    await expect(lastSlide.locator('.ititle')).toHaveText('Tekma');

    // Finish button
    await page.locator('#btnIntroNext').click();

    // Must return to Help screen
    await expect(page.locator('#help')).toHaveClass(/on/);
  });

  test('Freemium mode locks Personal and World Record ghosts and triggers paywall', async ({ page }) => {
    // Open settings
    await page.locator('#btnSettingsGear').click();
    await expect(page.locator('#settings')).toHaveClass(/on/);

    // Verify ghost options exist
    const ghostOpts = page.locator('#ghostOpts .setOpt');
    await expect(ghostOpts).toHaveCount(3);

    // In freemium mode, "Personal" and "World Record" should be locked
    const offOpt = ghostOpts.nth(0);
    const personalOpt = ghostOpts.nth(1);
    const worldOpt = ghostOpts.nth(2);

    await expect(offOpt).not.toHaveClass(/freemiumLocked/);
    await expect(personalOpt).toHaveClass(/freemiumLocked/);
    await expect(worldOpt).toHaveClass(/freemiumLocked/);

    await expect(personalOpt).toContainText('🔒');
    await expect(worldOpt).toContainText('🔒');

    // Verify freemium hint in hintSetGhost
    const ghostHint = page.locator('#hintSetGhost');
    await expect(ghostHint).toContainText('Ghost racer is locked in Freemium mode');

    // Clicking locked ghost option must open paywall modal
    await personalOpt.click();
    const paywallModal = page.locator('#paywallModal');
    await expect(paywallModal).toBeVisible();
    await expect(page.locator('#paywallSubtitle')).toContainText('Ghost racer');

    // Close paywall
    await page.locator('#btnPaywallClose').click();
    await expect(paywallModal).not.toBeVisible();
  });

  test('Full version unlocks ghost options and permits ghost selection', async ({ page }) => {
    // Open settings
    await page.locator('#btnSettingsGear').click();
    await expect(page.locator('#settings')).toHaveClass(/on/);

    // Enable full version
    await page.evaluate(() => {
      window.setFreemiumMode(false);
      window.openSettings();
    });

    const ghostOpts = page.locator('#ghostOpts .setOpt');
    const personalOpt = ghostOpts.nth(1);
    const worldOpt = ghostOpts.nth(2);

    // Must not be locked
    await expect(personalOpt).not.toHaveClass(/freemiumLocked/);
    await expect(worldOpt).not.toHaveClass(/freemiumLocked/);
    await expect(personalOpt).not.toContainText('🔒');

    // Selecting Personal ghost should update save without opening paywall modal
    await personalOpt.click();
    const paywallModal = page.locator('#paywallModal');
    await expect(paywallModal).not.toBeVisible();

    const ghostMode = await page.evaluate(() => window.save.ghostMode);
    expect(ghostMode).toBe('personal');
  });

  test('startRace() forces ghostMode to off when Freemium mode is active', async ({ page }) => {
    const raceGhostResult = await page.evaluate(() => {
      // Attempt to tamper with save.ghostMode while freemium is active
      window.save.freemiumMode = true;
      window.save.ghostMode = 'world';
      window.persist();

      // Start level 1, which sets up track/AI and calls startRace()
      window.startLevel(1);
      return {
        ghostKind: window.ghostKind,
        ghostPlay: window.ghostPlay
      };
    });

    expect(raceGhostResult.ghostKind).toBe('off');
    expect(raceGhostResult.ghostPlay).toBeNull();
  });

  test('setFreemiumMode(true) resets save.ghostMode to off', async ({ page }) => {
    const modeAfterToggle = await page.evaluate(() => {
      window.save.freemiumMode = false;
      window.save.ghostMode = 'personal';
      window.persist();

      // Now toggle freemium mode on
      window.setFreemiumMode(true);
      return window.save.ghostMode;
    });

    expect(modeAfterToggle).toBe('off');
  });

  test('Menu mode toggle button near ? toggles between Free and Paid mode', async ({ page }) => {
    const modeBtn = page.locator('#btnMenuModeToggle');
    const helpBtn = page.locator('#btnMenuHelp');
    await expect(modeBtn).toBeVisible();
    await expect(helpBtn).toBeVisible();

    // Verify initial Freemium state (from beforeEach: freemiumMode: true)
    await expect(modeBtn).toHaveClass(/isFree/);
    await expect(modeBtn.locator('#menuModeToggleIcon')).toHaveText('🔒');

    // Click mode button to toggle to Full Unlock
    await modeBtn.click();

    // Now should be in Full mode
    await expect(modeBtn).toHaveClass(/isFull/);
    await expect(modeBtn.locator('#menuModeToggleIcon')).toHaveText('💎');
    const isFreeAfterFirstClick = await page.evaluate(() => window.isFreemiumActive());
    expect(isFreeAfterFirstClick).toBe(false);

    // Click again to toggle back to Freemium
    await modeBtn.click();
    await expect(modeBtn).toHaveClass(/isFree/);
    await expect(modeBtn.locator('#menuModeToggleIcon')).toHaveText('🔒');
    const isFreeAfterSecondClick = await page.evaluate(() => window.isFreemiumActive());
    expect(isFreeAfterSecondClick).toBe(true);
  });

  test('Settings freemium mode box is located at the bottom of settings screen', async ({ page }) => {
    // Open settings
    await page.locator('#btnSettingsGear').click();
    await expect(page.locator('#settings')).toHaveClass(/on/);

    // Verify #freemiumToggleBox is placed after .setPage[data-page="sound"] and immediately before #btnSetBack
    const orderCheck = await page.evaluate(() => {
      const box = document.getElementById('freemiumToggleBox');
      const backBtn = document.getElementById('btnSetBack');
      const soundPage = document.querySelector('.setPage[data-page="sound"]');
      const tabs = document.getElementById('setTabs');

      // Check DOM node ordering (DOCUMENT_POSITION_PRECEDING = 2, DOCUMENT_POSITION_FOLLOWING = 4)
      const afterTabs = (tabs.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
      const afterSound = (soundPage.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
      const beforeBack = (box.compareDocumentPosition(backBtn) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

      return { afterTabs, afterSound, beforeBack };
    });

    expect(orderCheck.afterTabs).toBe(true);
    expect(orderCheck.afterSound).toBe(true);
    expect(orderCheck.beforeBack).toBe(true);

    // Verify it is visible at bottom even when switching tabs
    const freemiumBox = page.locator('#freemiumToggleBox');
    await expect(freemiumBox).toBeVisible();

    // Switch to look tab
    await page.locator('.setTab[data-tab="look"]').click();
    await expect(freemiumBox).toBeVisible();

    // Switch to sound tab
    await page.locator('.setTab[data-tab="sound"]').click();
    await expect(freemiumBox).toBeVisible();
  });

  test('Career mode is locked in Freemium mode and displays lock badge', async ({ page }) => {
    const careerBtn = page.locator('#btnCareer');
    await expect(careerBtn).toBeVisible();

    // Verify lock badge and styling in freemium mode
    await expect(careerBtn).toHaveClass(/freemiumLocked/);
    const badge = careerBtn.locator('.freemiumLockBadge');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText('🔒');

    // Clicking locked Career button opens paywall modal with career subtitle
    await careerBtn.click();
    const paywallModal = page.locator('#paywallModal');
    await expect(paywallModal).toBeVisible();
    await expect(page.locator('#paywallSubtitle')).toContainText('Career mode');

    // Verify Career feature item is visible in paywall modal
    const careerFeature = page.locator('#pwFeatCareer');
    await expect(careerFeature).toBeVisible();
    await expect(careerFeature).toContainText('Career mode');

    // Close paywall
    await page.locator('#btnPaywallClose').click();
    await expect(paywallModal).not.toBeVisible();

    // Direct invocation of openCareer() and startCareer() must also trigger paywall
    await page.evaluate(() => window.openCareer());
    await expect(paywallModal).toBeVisible();
    await expect(page.locator('#paywallSubtitle')).toContainText('Career mode');

    await page.locator('#btnPaywallClose').click();
    await expect(paywallModal).not.toBeVisible();

    await page.evaluate(() => window.startCareer(1));
    await expect(paywallModal).toBeVisible();
    await expect(page.locator('#paywallSubtitle')).toContainText('Career mode');
  });

  test('Full version unlocks Career mode and allows opening career levels', async ({ page }) => {
    // Switch to Full Unlock
    await page.evaluate(() => {
      window.setFreemiumMode(false);
    });

    const careerBtn = page.locator('#btnCareer');
    await expect(careerBtn).not.toHaveClass(/freemiumLocked/);
    await expect(careerBtn.locator('.freemiumLockBadge')).toHaveCount(0);

    // Call openCareer directly in full mode: should navigate to clevels
    await page.evaluate(() => {
      window.openCareer();
    });

    const clevelsScreen = page.locator('#clevels');
    await expect(clevelsScreen).toHaveClass(/on/);
    const paywallModal = page.locator('#paywallModal');
    await expect(paywallModal).not.toBeVisible();
  });

});

