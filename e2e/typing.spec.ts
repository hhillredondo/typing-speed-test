import { test, expect } from "@playwright/test";

test("typing a letter starts the test and decrements the timer", async ({ page }) => {
  await page.goto("/home");

  // Timer starts at 60. Type one letter to start the test.
  await expect(page.getByText("60")).toBeVisible();
  await page.keyboard.press("a");

  // Within ~1.5s the timer should tick down to 59.
  await expect(page.getByText("59")).toBeVisible({ timeout: 2_000 });
});
