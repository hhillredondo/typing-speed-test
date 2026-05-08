import { test, expect } from "@playwright/test";

test.describe("smoke", () => {
  test("home page renders the typing test", async ({ page }) => {
    await page.goto("/home");
    await expect(page).toHaveTitle(/Typing Speed/i);
    // Timer starts at 60 seconds; the WPM counter (h2) starts at 0.
    await expect(page.getByText("60")).toBeVisible();
    await expect(page.getByText("words per minute")).toBeVisible();
  });

  test("nav buttons route to the four main views without errors", async ({ page }) => {
    await page.goto("/home");

    await page.getByRole("button", { name: /Scores/i }).click();
    await expect(page).toHaveURL(/\/scores$/);

    await page.getByRole("button", { name: /Analytics/i }).click();
    await expect(page).toHaveURL(/\/analytics$/);

    await page.getByRole("button", { name: /Weakness Drill/i }).click();
    await expect(page).toHaveURL(/\/drill$/);

    await page.getByRole("button", { name: /Home/i }).click();
    await expect(page).toHaveURL(/\/home$/);
  });

  test("theme toggle persists across reload", async ({ page }) => {
    await page.goto("/home");
    // Read the starting theme from localStorage (defaults to "light" when unset).
    const before = await page.evaluate(() => localStorage.getItem("theme") ?? "light");

    await page.getByRole("button", { name: /Dark mode|Light mode/i }).click();
    const after = await page.evaluate(() => localStorage.getItem("theme"));
    expect(after).not.toBe(before);

    await page.reload();
    const persisted = await page.evaluate(() => localStorage.getItem("theme"));
    expect(persisted).toBe(after);
  });
});
