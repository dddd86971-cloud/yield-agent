import { test, expect } from "@playwright/test";

test.describe("Dashboard", () => {
  test("renders header and title", async ({ page }) => {
    await page.goto("/app");
    await expect(page.locator("text=YieldAgent").first()).toBeVisible();
    await expect(page.locator("h1")).toContainText("Dashboard");
  });

  test("renders agent chat with quick actions", async ({ page }) => {
    await page.goto("/app");
    await expect(page.locator("text=Talk to the Agent")).toBeVisible();
    await expect(page.locator("text=Deploy 100 USDT moderate")).toBeVisible();
    await expect(page.locator("text=Analyze the pool")).toBeVisible();
  });

  test("renders three brain panels", async ({ page }) => {
    await page.goto("/app");
    await expect(page.locator("text=Market Brain")).toBeVisible();
    await expect(page.locator("text=Pool Brain")).toBeVisible();
    await expect(page.locator("text=Risk Brain")).toBeVisible();
  });

  test("renders intent input with pool selector", async ({ page }) => {
    await page.goto("/app");
    await expect(page.locator("text=Tell the Agent What You Want")).toBeVisible();
    await expect(page.locator("text=USDT/OKB 0.3%")).toBeVisible();
    await expect(page.locator("text=WETH/USDT 0.3%")).toBeVisible();
  });

  test("renders wallet connect button", async ({ page }) => {
    await page.goto("/app");
    await expect(page.locator("button:has-text('Connect')").first()).toBeVisible();
  });
});
