import { test, expect } from "@playwright/test";

const tabs = ["dns", "speed", "adblock", "headers", "fingerprint", "quality", "network", "about"];

async function clickTab(page: import("@playwright/test").Page, tab: string): Promise<void> {
  const desktopLink = page.locator(`.nav-link[data-tab="${tab}"]`);
  if (await desktopLink.isVisible()) {
    await desktopLink.click();
  } else {
    await page.click(`.nav-bottom-item[data-tab="${tab}"]`);
  }
  await page.waitForSelector(`#${tab}.active`);
  await page.waitForLoadState("networkidle");
}

for (const tab of tabs) {
  test(`${tab} tab renders correctly`, async ({ page }) => {
    await page.goto("/");
    await clickTab(page, tab);
    await expect(page).toHaveScreenshot(`${tab}-tab.png`, { fullPage: true });
  });
}

test("dark and light theme switching", async ({ page }) => {
  await page.goto("/");
  await page.click("#theme-toggle");
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveScreenshot("light-theme.png", { fullPage: true });
});

test("mobile bottom nav visible at 375px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await expect(page.locator(".nav-bottom")).toBeVisible();
  await expect(page).toHaveScreenshot("mobile-nav-bottom.png", { fullPage: true });
});
