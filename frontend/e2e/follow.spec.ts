import { test, expect } from "@playwright/test";

test.describe("Follow / Leaderboard Page", () => {
  test("renders leaderboard heading", async ({ page }) => {
    await page.goto("/app/follow");
    await expect(page.locator("h1")).toContainText("Leaderboard");
  });

  test("shows on-chain stats", async ({ page }) => {
    await page.goto("/app/follow");
    await expect(page.locator("text=Active Strategies")).toBeVisible();
    await expect(page.locator("text=Total Decisions")).toBeVisible();
  });

  test("shows FollowVault status", async ({ page }) => {
    await page.goto("/app/follow");
    await expect(page.getByText("FollowVault", { exact: true })).toBeVisible();
  });

  test("shows copy-trading guide", async ({ page }) => {
    await page.goto("/app/follow");
    await expect(page.locator("text=How Copy-Trading Works")).toBeVisible();
    await expect(page.getByText("Deposit", { exact: true })).toBeVisible();
    await expect(page.locator("text=Auto-mirror")).toBeVisible();
  });
});
