import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./visual",
  snapshotDir: "./visual/snapshots",
  expect: { toHaveScreenshot: { maxDiffPixels: 100 } },
  use: {
    baseURL: "http://localhost:8787",
    viewport: { width: 1280, height: 800 },
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 800 } } },
  ],
});
