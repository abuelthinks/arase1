import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const SCREENSHOT_DIR = path.join(__dirname, "../../../playwright-screenshots");
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

test.describe("E2E Audit - Specialist & Teacher Panels", () => {
  test("should successfully audit Specialist workflow", async ({ page }) => {
    // 1. Log in as Specialist
    await page.goto("/login");
    await page.fill("#email", "specialist@example.com");
    await page.fill("#password", "password123");
    await page.click("button[type='submit']");

    // 2. Wait for landing view
    await page.waitForURL(url => url.pathname.includes("/workspace") || url.pathname.includes("/specialist-onboarding"));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "specialist_01_workspace_landing.png") });

    // 3. Let Next.js load the student workspace automatically (no hardcoded ID)
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "specialist_02_workspace.png") });
    
    // Verify specialty or workspace header exists
    await expect(page.locator("h2, h1").first()).toBeVisible();
  });

  test("should successfully audit Teacher workflow", async ({ page }) => {
    // 1. Log in as Teacher
    await page.goto("/login");
    await page.fill("#email", "teacher@example.com");
    await page.fill("#password", "password123");
    await page.click("button[type='submit']");

    // 2. Wait for landing view
    await page.waitForURL(url => url.pathname.includes("/workspace"));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "teacher_01_workspace_landing.png") });

    // 3. Let Next.js load the student workspace automatically (no hardcoded ID)
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "teacher_02_workspace.png") });

    // Ensure pre-enrollment assessment is NOT available to teacher (IEP guidelines in skill.md)
    const parentAssessmentTab = page.locator("button:has-text('Parent Assessment'), a:has-text('Parent Assessment')");
    const count = await parentAssessmentTab.count();
    expect(count).toBe(0);
  });
});
