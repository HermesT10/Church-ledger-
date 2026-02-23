import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3000",
    headless: true,
    video: "on",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    ignoreHTTPSErrors: true, // ngrok sometimes needs this
  },
  reporter: [["html", { open: "never" }], ["list"]],
});
