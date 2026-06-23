import { test, expect } from "@playwright/test";

const workflows = ["overview", "dns", "speed", "security", "privacy", "ai"];

async function clickWorkflow(page: import("@playwright/test").Page, workflow: string): Promise<void> {
  const desktopLink = page.locator(`.tab-link[data-tab="${workflow}"]`);
  if (await desktopLink.isVisible()) {
    await desktopLink.click();
  } else {
    await page.click(`.tab-bar-mobile-item[data-tab="${workflow}"]`);
  }
  await page.waitForSelector(`#${workflow}.active`);
  await page.waitForLoadState("networkidle");
}

for (const workflow of workflows) {
  test(`${workflow} workflow renders correctly`, async ({ page }) => {
    await page.goto("/");
    await clickWorkflow(page, workflow);
    await expect(page).toHaveScreenshot(`${workflow}-workflow.png`, { fullPage: true });
  });
}

test("legacy hash redirects to new workflows", async ({ page }) => {
  await page.goto("/#dashboard");
  await page.waitForURL(/#overview/);
  await expect(page.locator("#overview")).toHaveClass(/active/);

  await page.goto("/#adblock");
  await page.waitForURL(/#privacy/);
  await expect(page.locator("#privacy")).toHaveClass(/active/);

  await page.goto("/#headers");
  await page.waitForURL(/#security/);
  await expect(page.locator("#security")).toHaveClass(/active/);
});

test("dark and light theme switching", async ({ page }) => {
  await page.goto("/");
  await page.click("#theme-toggle-header");
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveScreenshot("light-theme.png", { fullPage: true });
});

test("mobile bottom tab bar visible at 375px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await expect(page.locator(".tab-bar-mobile")).toBeVisible();
  await expect(page).toHaveScreenshot("mobile-tab-bar.png", { fullPage: true });
});