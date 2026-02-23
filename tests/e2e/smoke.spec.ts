import { test, expect } from "@playwright/test";

const email = process.env.E2E_EMAIL!;
const password = process.env.E2E_PASSWORD!;

test("Login + visit all sidebar pages + capture console/network errors", async ({ page }) => {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(`[console.error] ${msg.text()}`);
  });

  page.on("requestfailed", (req) => {
    failedRequests.push(`[requestfailed] ${req.method()} ${req.url()} :: ${req.failure()?.errorText}`);
  });

  // 1) Handle ngrok interstitial (free tier shows a "Visit Site" button)
  await page.goto("/login", { waitUntil: "domcontentloaded" });

  const ngrokButton = page.getByRole("button", { name: /visit site/i });
  if (await ngrokButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await ngrokButton.click();
    await page.waitForURL("**/login**", { waitUntil: "domcontentloaded" });
  }

  // 2) Login (selectors match the actual login form)
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);

  await page.getByRole("button", { name: /login/i }).click();
  await page.waitForURL("**/dashboard**", { timeout: 30000 });

  // 2) Pages to visit (update paths to match your sidebar)
  const paths = [
    "/dashboard",
    "/funds",
    "/accounts",
    "/journals",
    "/banking",
    "/reconciliation",
    "/suppliers",
    "/bills",
    "/payment-runs",
    "/payroll",
    "/gift-aid",
    "/giving-platforms",
    "/giving-imports",
    "/budgets",
    "/reports",
    "/settings",
    "/profile",
  ];

  const timings: { path: string; ms: number }[] = [];

  for (const path of paths) {
    const t0 = Date.now();
    await page.goto(path, { waitUntil: "networkidle" });
    const ms = Date.now() - t0;
    timings.push({ path, ms });

    // Basic sanity: page should not show a generic error boundary text
    await expect(page.locator("text=Something went wrong").first()).toHaveCount(0);

    // Optional: ensure sidebar still visible (adjust selector)
    await expect(page.locator("nav")).toBeVisible();
  }

  // 3) Fail the test if we found issues; include diagnostics in output
  const slow = timings.filter(t => t.ms > 3000); // tune threshold
  if (consoleErrors.length || failedRequests.length || slow.length) {
    console.log("\n=== PAGE TIMINGS (ms) ===");
    for (const t of timings) console.log(`${t.ms}\t${t.path}`);

    if (slow.length) {
      console.log("\n=== SLOW PAGES (>3000ms) ===");
      for (const s of slow) console.log(`${s.ms}\t${s.path}`);
    }

    if (consoleErrors.length) {
      console.log("\n=== CONSOLE ERRORS ===");
      consoleErrors.forEach(e => console.log(e));
    }

    if (failedRequests.length) {
      console.log("\n=== FAILED REQUESTS ===");
      failedRequests.forEach(e => console.log(e));
    }

    throw new Error("Found console errors, failed requests, or slow pages. See logs above + HTML report/trace.");
  }
});
