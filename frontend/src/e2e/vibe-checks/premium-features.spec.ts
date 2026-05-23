import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const SCREENSHOT_DIR = path.join(__dirname, "../../../playwright-screenshots");
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

test.describe("E2E Audit - Premium User Experience Features", () => {
  test("should successfully verify accessibility toolbar, goal progress graph, and timeline drawer", async ({ page }) => {
    // 1. Log in as Admin
    await page.goto("/login");
    await page.fill("#email", "admin@example.com");
    await page.fill("#password", "password123");
    await page.click("button[type='submit']");
    await page.waitForURL("**/dashboard**");

    // 2. Locate Floating Accessibility Toolbar button
    const accessibilityBtn = page.locator("button:has-text('Accessibility')");
    await expect(accessibilityBtn).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "premium_01_accessibility_btn.png") });

    // 3. Click it and open panel
    await accessibilityBtn.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "premium_02_accessibility_panel.png") });

    // 4. Toggle Dark Theme
    const darkBtn = page.locator("button:has-text('Dark')");
    await expect(darkBtn).toBeVisible();
    await darkBtn.click();
    await page.waitForTimeout(500);

    // Verify dark class was added to html element
    const htmlClass = await page.evaluate(() => document.documentElement.className);
    expect(htmlClass).toContain("dark-theme");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "premium_03_dark_mode_active.png") });

    // Toggle back to Light Theme for remaining audits
    const lightBtn = page.locator("button:has-text('Light')");
    await lightBtn.click();
    await page.waitForTimeout(500);

    // Go to Students tab to get the dynamic student ID
    await page.goto("/dashboard?tab=students");
    const studentLink = page.locator("a[href*='studentId=']").first();
    await studentLink.waitFor({ state: "visible", timeout: 15000 });
    const href = await studentLink.getAttribute("href");
    const studentId = href ? new URL(href, "http://localhost").searchParams.get("studentId") : "1";

    // 5. Navigate to Tommy Johnson's Workspace to verify Progress Graph & Drawer
    await page.goto(`/workspace?studentId=${studentId}`);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "premium_04_workspace_overview.png") });

    // Verify the SVG Graph exists
    const progressGraphHeader = page.locator("h2:has-text('IEP Goals Progress Chart')");
    await expect(progressGraphHeader).toBeVisible();
    
    // Hover over first bar (SLP) to trigger tooltip and pane update
    const slpBar = page.locator("g:has-text('SLP')").first();
    if (await slpBar.isVisible()) {
      await slpBar.hover();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "premium_05_graph_hover_tooltip.png") });
    }

    // 6. Click "View all" to trigger Sliding Timeline Drawer
    const viewAllBtn = page.locator("button:has-text('View all')");
    await expect(viewAllBtn).toBeVisible();
    await viewAllBtn.click({ force: true });
    await page.waitForTimeout(1000); // Allow drawer slide-in transition
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "premium_06_activity_drawer.png") });

    // Verify drawer header is shown
    const drawerHeader = page.locator("h3:has-text('Activity History')");
    await expect(drawerHeader).toBeVisible();

    // Close the drawer
    const closeDrawerBtn = page.locator("button:has(svg)").last();
    await closeDrawerBtn.click();
    await page.waitForTimeout(500);
  });
});
