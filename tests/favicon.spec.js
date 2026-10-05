// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

test.describe('Favicon & App Icon Integration', () => {
  const FILE_URL = 'file:///' + path.resolve(__dirname, '../index.html').replace(/\\/g, '/');

  test('Favicon assets exist on disk', async () => {
    const root = path.resolve(__dirname, '..');
    expect(fs.existsSync(path.join(root, 'favicon.svg'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'favicon-32x32.png'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'favicon.ico'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'icon-192.png'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'icon-512.png'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'apple-touch-icon.png'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'manifest.json'))).toBe(true);
  });

  test('Favicon links and manifest are present in index.html head', async ({ page }) => {
    await page.goto(FILE_URL);
    
    // Check SVG favicon link
    const svgIcon = page.locator('link[rel="icon"][type="image/svg+xml"]');
    await expect(svgIcon).toHaveAttribute('href', 'favicon.svg');

    // Check PNG favicon link
    const pngIcon = page.locator('link[rel="icon"][sizes="32x32"]');
    await expect(pngIcon).toHaveAttribute('href', 'favicon-32x32.png');

    // Check Apple touch icon
    const appleIcon = page.locator('link[rel="apple-touch-icon"]');
    await expect(appleIcon).toHaveAttribute('href', 'apple-touch-icon.png');

    // Check manifest link
    const manifest = page.locator('link[rel="manifest"]');
    await expect(manifest).toHaveAttribute('href', 'manifest.json');
  });

  test('manifest.json has valid structure and references icons', async () => {
    const manifestPath = path.resolve(__dirname, '../manifest.json');
    const content = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(content.name).toContain('Finger Racer');
    expect(Array.isArray(content.icons)).toBe(true);
    expect(content.icons.length).toBeGreaterThanOrEqual(3);
  });
});
