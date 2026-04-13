import { test, expect } from "@playwright/test";

test.describe("Landing Page", () => {
  test("renders hero section", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toContainText("AI LP Manager");
    await expect(page.locator("text=Launch App").first()).toBeVisible();
  });

  test("renders three brain features", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Market Brain")).toBeVisible();
    await expect(page.locator("text=Pool Brain")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Risk Brain" })).toBeVisible();
  });

  test("renders Try Agent chat widget", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Talk to the Agent")).toBeVisible();
    await expect(page.locator("text=YieldAgent Chat")).toBeVisible();
  });

  test("renders FAQ section", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Questions you should be asking")).toBeVisible();
  });

  test("Launch App navigates to dashboard", async ({ page }) => {
    await page.goto("/");
    await page.locator("a:has-text('Launch App')").first().click();
    await expect(page).toHaveURL("/app");
  });
});
