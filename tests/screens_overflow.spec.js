const { test, expect } = require('@playwright/test');
const path = require('path');

const FILE_URL = 'file://' + path.resolve(__dirname, '../index.html').replace(/\\/g, '/');

const VIEWPORTS = [
  { name: 'Small Mobile (360x740)', width: 360, height: 740 },
  { name: 'iPhone 14 (390x844)', width: 390, height: 844 },
  { name: 'Desktop (800x600)', width: 800, height: 600 }
];

test.describe('Screen Horizontal Overflow & Panning Prevention', () => {

  for (const vp of VIEWPORTS) {
    test(`Intro screen has zero horizontal overflow on ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(FILE_URL);
      await page.evaluate(() => {
        localStorage.clear();
        localStorage.setItem('prstna-dirka', JSON.stringify({ tutSeen: true, introSeen: true }));
      });
      await page.goto(FILE_URL);
      await page.waitForSelector('#menu.on', { timeout: 10000 });

      // Open Intro via openIntro helper
      await page.evaluate(() => {
        if (typeof openIntro === 'function') openIntro('menu');
      });
      await expect(page.locator('#intro')).toHaveClass(/on/);

      // Check all 5 slides
      for (let i = 0; i <= 4; i++) {
        await page.evaluate((idx) => {
          if (typeof showIntro === 'function') showIntro(idx);
        }, i);

        // Wait for slide animation to complete
        await page.waitForTimeout(400);

        const overflowCheck = await page.evaluate(() => {
          const intro = document.getElementById('intro');
          const panel = intro ? intro.querySelector('.panel') : null;
          let culprits = [];
          if (panel) {
            for (const el of panel.querySelectorAll('*')) {
              if (el.scrollWidth > panel.clientWidth + 1 || el.offsetWidth > panel.clientWidth + 1) {
                culprits.push({
                  tag: el.tagName,
                  id: el.id,
                  cls: el.className,
                  scrollWidth: el.scrollWidth,
                  offsetWidth: el.offsetWidth,
                  clientWidth: el.clientWidth,
                  clientRectWidth: el.getBoundingClientRect().width,
                  panelClientWidth: panel.clientWidth
                });
              }
            }
          }
          return {
            introScrollWidth: intro ? intro.scrollWidth : 0,
            introClientWidth: intro ? intro.clientWidth : 0,
            panelScrollWidth: panel ? panel.scrollWidth : 0,
            panelClientWidth: panel ? panel.clientWidth : 0,
            windowScrollX: window.scrollX,
            culprits
          };
        });

        if (overflowCheck.panelScrollWidth > overflowCheck.panelClientWidth) {
          console.log(`[Slide ${i} Culprits]:`, JSON.stringify(overflowCheck.culprits));
        }

        expect(overflowCheck.introScrollWidth).toBeLessThanOrEqual(overflowCheck.introClientWidth);
        expect(overflowCheck.panelScrollWidth).toBeLessThanOrEqual(overflowCheck.panelClientWidth);
        expect(overflowCheck.windowScrollX).toBe(0);
      }
    });

    test(`Help screen has zero horizontal overflow on ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(FILE_URL);
      await page.evaluate(() => {
        localStorage.clear();
        localStorage.setItem('prstna-dirka', JSON.stringify({ tutSeen: true, introSeen: true }));
      });
      await page.goto(FILE_URL);
      await page.waitForSelector('#menu.on', { timeout: 10000 });

      // Open Help via setScreen
      await page.evaluate(() => {
        if (typeof setScreen === 'function') setScreen('help');
      });
      await expect(page.locator('#help')).toHaveClass(/on/);

      const overflowCheck = await page.evaluate(() => {
        const help = document.getElementById('help');
        const panel = help ? help.querySelector('.panel') : null;
        const helpTxt = help ? help.querySelector('.helpTxt') : null;
        return {
          helpScrollWidth: help ? help.scrollWidth : 0,
          helpClientWidth: help ? help.clientWidth : 0,
          panelScrollWidth: panel ? panel.scrollWidth : 0,
          panelClientWidth: panel ? panel.clientWidth : 0,
          helpTxtScrollWidth: helpTxt ? helpTxt.scrollWidth : 0,
          helpTxtClientWidth: helpTxt ? helpTxt.clientWidth : 0,
          windowScrollX: window.scrollX
        };
      });

      expect(overflowCheck.helpScrollWidth).toBeLessThanOrEqual(overflowCheck.helpClientWidth);
      expect(overflowCheck.panelScrollWidth).toBeLessThanOrEqual(overflowCheck.panelClientWidth);
      expect(overflowCheck.helpTxtScrollWidth).toBeLessThanOrEqual(overflowCheck.helpTxtClientWidth);
      expect(overflowCheck.windowScrollX).toBe(0);
    });

    test(`Tutorial modal screen has zero horizontal overflow on ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(FILE_URL);
      await page.evaluate(() => {
        localStorage.clear();
        localStorage.setItem('prstna-dirka', JSON.stringify({ tutSeen: true, introSeen: true }));
      });
      await page.goto(FILE_URL);
      await page.waitForSelector('#menu.on', { timeout: 10000 });

      // Open Tutorial via setScreen
      await page.evaluate(() => {
        if (typeof setScreen === 'function') setScreen('tutorial');
      });
      await expect(page.locator('#tutorial')).toHaveClass(/on/);

      const overflowCheck = await page.evaluate(() => {
        const tut = document.getElementById('tutorial');
        const panel = tut ? tut.querySelector('.panel') : null;
        return {
          tutScrollWidth: tut ? tut.scrollWidth : 0,
          tutClientWidth: tut ? tut.clientWidth : 0,
          panelScrollWidth: panel ? panel.scrollWidth : 0,
          panelClientWidth: panel ? panel.clientWidth : 0,
          windowScrollX: window.scrollX
        };
      });

      expect(overflowCheck.tutScrollWidth).toBeLessThanOrEqual(overflowCheck.tutClientWidth);
      expect(overflowCheck.panelScrollWidth).toBeLessThanOrEqual(overflowCheck.panelClientWidth);
      expect(overflowCheck.windowScrollX).toBe(0);
    });
  }
});
