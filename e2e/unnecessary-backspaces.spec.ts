import { test, expect, type Page } from "@playwright/test";

// The client only decodes the token to schedule renewal, and every API call is stubbed.
const fakeToken = ["e30", Buffer.from(JSON.stringify({ exp: 4_102_444_800 })).toString("base64url"), "x"].join(".");

async function signInWithStubbedApi(page: Page) {
  const session = { _id: "e2e-user", name: "E2E", email: "e2e@example.com", token: fakeToken };
  await page.addInitScript((s) => localStorage.setItem("user", JSON.stringify(s)), session);
  await page.route("**/api/**", (route) => route.fulfill({ status: 404 }));
}

test("a finished test posts its unnecessary backspaces", async ({ page }) => {
  await signInWithStubbedApi(page);
  await page.route("**/api/scores/", (route) => route.fulfill({ status: 201, json: {} }));
  await page.clock.install();
  await page.goto("/home");

  const word = (await page.locator("input[disabled]").inputValue()).split(" ")[0];
  const kb = page.keyboard;
  await kb.type(word[0]);
  await kb.press("Backspace"); // unnecessary: nothing typed was wrong
  await kb.type(word[0] + "#");
  await kb.press("Backspace"); // necessary: deletes the typo
  await kb.type(word.slice(1) + " ");
  await kb.press("Backspace"); // unnecessary: empty input

  const posted = page.waitForRequest((r) => r.url().endsWith("/api/scores/") && r.method() === "POST");
  let done = false;
  posted.then(() => (done = true));
  // Each timer tick is scheduled only after React renders the previous one, so step the clock.
  for (let i = 0; i < 600 && !done; i++) await page.clock.runFor(1000);

  const { backspaceStats } = (await posted).postDataJSON().analytics;
  expect(backspaceStats.totalBackspaces).toBe(3);
  expect(backspaceStats.unnecessaryBackspaces).toBe(2);
});

const profileWith = (rollingBackspaceStats: object) => ({
  totalTests: 2, // under 3 keeps the AI coach card from fetching
  recentWpm: [40, 42],
  recentAccuracy: [95, 96],
  wpmTrend: 0,
  fatigueArchetype: "consistent",
  rollingKeyStats: {},
  weakestKeys: [],
  slowestBigrams: [],
  avgWindows: [],
  rollingBackspaceStats,
  updatedAt: "2026-10-06T00:00:00.000Z",
});

const legacyBackspaceStats = {
  totalBackspaces: 20, wordsWithBackspace: 6, wordsRecovered: 4, wordsFailed: 1,
  totalConsecutiveRuns: 8, totalConsecutiveLength: 20,
};

for (const { name, stats, expected } of [
  {
    name: "averages over the tests that tracked it",
    stats: { ...legacyBackspaceStats, unnecessaryBackspaces: 9, unnecessaryTrackedTests: 3 },
    expected: "3.0",
  },
  { name: "shows a placeholder for a profile that predates it", stats: legacyBackspaceStats, expected: "—" },
]) {
  test(`unnecessary backspaces tile ${name}`, async ({ page }) => {
    await signInWithStubbedApi(page);
    await page.route("**/api/analytics", (route) => route.fulfill({ json: profileWith(stats) }));
    await page.goto("/analytics");

    const tile = page.getByText("Unnecessary backspaces / test").locator("..");
    await expect(tile.locator("h5")).toHaveText(expected);
  });
}
