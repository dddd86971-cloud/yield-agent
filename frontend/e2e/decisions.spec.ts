import { test, expect } from "@playwright/test";

test.describe("Decision Log Page", () => {
  test("renders heading", async ({ page }) => {
    await page.goto("/app/decisions");
    await expect(page.locator("h1")).toContainText("Decision Log");
  });

  test("shows stat cards", async ({ page }) => {
    await page.goto("/app/decisions");
    await expect(page.getByText("Total", { exact: true })).toBeVisible();
    await expect(page.getByText("Deploy", { exact: true })).toBeVisible();
    await expect(page.locator("text=Rebalance")).toBeVisible();
  });

  test("shows empty state or decisions", async ({ page }) => {
    await page.goto("/app/decisions");
    const content = page.getByText("No decisions yet", { exact: true }).or(page.getByText("Average Confidence"));
    await expect(content.first()).toBeVisible();
  });
});
