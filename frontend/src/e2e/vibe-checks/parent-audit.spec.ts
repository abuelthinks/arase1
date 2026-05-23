import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const SCREENSHOT_DIR = path.join(__dirname, "../../../playwright-screenshots");
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

test.describe("E2E Audit - Parent Panel", () => {
  test("should successfully log in as Parent, verify dashboard, and navigate child workspace", async ({ page }) => {
    // 1. Log in as Parent
    await page.goto("/login");
    await page.fill("#email", "parent@example.com");
    await page.fill("#password", "password123");
    await page.click("button[type='submit']");

    // 2. Wait for landing view
    await page.waitForURL("**/dashboard**");
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "parent_01_dashboard.png") });

    // Verify Tommy Johnson's card is visible
    const childCardHeader = page.locator("h3", { hasText: "Tommy Johnson" });
    await expect(childCardHeader).toBeVisible();

    // Verify SMS prompt or profile setup links if available
    const verifyButton = page.locator("button:has-text('Verify Now')");
    if (await verifyButton.isVisible()) {
      await verifyButton.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "parent_02_sms_modal.png") });
      // Close modal (standard close buttons like click overlay or pressing escape)
      await page.keyboard.press("Escape");
    }

    // Get dynamic student ID from primary CTA links
    const ctaButton = page.locator("a[href*='studentId=']").first();
    await ctaButton.waitFor({ state: "visible", timeout: 15000 });
    const href = await ctaButton.getAttribute("href");
    const studentId = href ? new URL(href, "http://localhost").searchParams.get("studentId") : "1";

    // 3. Navigate to Child's Workspace
    await page.goto(`/workspace?studentId=${studentId}`);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "parent_03_child_workspace.png") });

    // Verify parent has access to key workspace elements (using Tommy's name or workspace header)
    const workspaceTitle = page.locator("h1:has-text('Tommy'), h2:has-text('Tommy')").first();
    await expect(workspaceTitle).toBeVisible();
  });
});
