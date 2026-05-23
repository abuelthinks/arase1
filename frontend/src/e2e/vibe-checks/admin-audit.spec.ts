import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const SCREENSHOT_DIR = path.join(__dirname, "../../../playwright-screenshots");
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

test.describe("E2E Audit - Admin Panel", () => {
  test("should successfully log in as Admin, navigate tabs, and capture screenshots", async ({ page }) => {
    // 1. Go to Login Page
    await page.goto("/login");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "admin_01_login_page.png") });

    // 2. Fill login credentials
    await page.fill("#email", "admin@example.com");
    await page.fill("#password", "password123");
    await page.click("button[type='submit']");

    // 3. Verify landing on Admin Dashboard
    await page.waitForURL("**/dashboard**");
    await expect(page.locator("h2").filter({ hasText: /Good/ }).first()).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "admin_02_dashboard_landing.png") });

    // 4. Click 'Invitations' tab (tab is loaded via query parameter or click)
    const invitationsTab = page.locator("a[href='/dashboard?tab=invitations'], button:has-text('Invitations')").first();
    if (await invitationsTab.isVisible()) {
      await invitationsTab.click();
      await page.waitForTimeout(1000); // Wait for transition
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "admin_03_tab_invitations.png") });
    }

    // 5. Click 'Users' tab
    const usersTab = page.locator("a[href='/dashboard?tab=users'], button:has-text('Users')").first();
    if (await usersTab.isVisible()) {
      await usersTab.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "admin_04_tab_users.png") });
    }

    // Go to Students tab to get the dynamic student ID
    await page.goto("/dashboard?tab=students");
    const studentLink = page.locator("a[href*='studentId=']").first();
    await studentLink.waitFor({ state: "visible", timeout: 15000 });
    const href = await studentLink.getAttribute("href");
    const studentId = href ? new URL(href, "http://localhost").searchParams.get("studentId") : "1";

    // 6. Navigate to Student Workspace (using dynamic student ID)
    await page.goto(`/workspace?studentId=${studentId}`);
    await page.waitForTimeout(2000); // Allow workspace loading
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "admin_05_student_workspace.png") });

    // 7. Verify main elements are present in the workspace
    const workspaceHeader = page.locator("h1:has-text('Tommy'), h2:has-text('Tommy')").first();
    await expect(workspaceHeader).toBeVisible();
  });
});
