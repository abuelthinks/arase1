import { test, expect } from "@playwright/test";

test.describe("SPED Automated Reporting App - Homepage", () => {
  test("should display the homepage header and introductory text", async ({ page }) => {
    // Navigate to the homepage (configured base URL)
    await page.goto("/");

    // Verify page contains the main header
    const mainHeader = page.locator("h1");
    await expect(mainHeader).toBeVisible();
    await expect(mainHeader).toHaveText("Automated Reporting App for SPED");

    // Verify introductory description
    const introText = page.locator("p");
    await expect(introText).toBeVisible();
    await expect(introText).toContainText("IEP, Assessment, and Monthly Progress reporting");
  });

  test("should have a functional link leading to the login page", async ({ page }) => {
    await page.goto("/");

    // Locate the login link
    const loginLink = page.locator("a", { hasText: "Login to Portal" });
    await expect(loginLink).toBeVisible();
    await expect(loginLink).toHaveAttribute("href", "/login");

    // Click the login link and verify navigation (URL path should change)
    await loginLink.click();
    await expect(page).toHaveURL(/\/login/);
  });
});
