# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: vibe-checks\admin-audit.spec.ts >> E2E Audit - Admin Panel >> should successfully log in as Admin, navigate tabs, and capture screenshots
- Location: src\e2e\vibe-checks\admin-audit.spec.ts:11:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.waitForURL: Test timeout of 30000ms exceeded.
=========================== logs ===========================
waiting for navigation to "**/dashboard**" until "load"
============================================================
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - region "Notifications alt+T"
  - button "Accessibility" [ref=e3] [cursor=pointer]:
    - img [ref=e4]
    - generic [ref=e7]: Accessibility
    - img [ref=e8]
  - generic [ref=e14]:
    - heading "Welcome Back" [level=2] [ref=e15]
    - paragraph [ref=e16]: Sign in to access student reports
    - generic [ref=e17]: No active account found with the given credentials
    - generic [ref=e18]:
      - generic [ref=e19]:
        - generic [ref=e20]: Email
        - textbox "Email" [ref=e21]:
          - /placeholder: Enter your email address
          - text: admin@example.com
      - generic [ref=e22]:
        - generic [ref=e23]: Password
        - textbox "Password" [ref=e24]:
          - /placeholder: ••••••••
          - text: password123
      - button "Sign In" [ref=e25] [cursor=pointer]
  - generic [ref=e30] [cursor=pointer]:
    - button "Open Next.js Dev Tools" [ref=e31]:
      - img [ref=e32]
    - generic [ref=e35]:
      - button "Open issues overlay" [ref=e36]:
        - generic [ref=e37]:
          - generic [ref=e38]: "0"
          - generic [ref=e39]: "1"
        - generic [ref=e40]: Issue
      - button "Collapse issues badge" [ref=e41]:
        - img [ref=e42]
  - alert [ref=e44]
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | import * as fs from "fs";
  3  | import * as path from "path";
  4  | 
  5  | const SCREENSHOT_DIR = path.join(__dirname, "../../../playwright-screenshots");
  6  | if (!fs.existsSync(SCREENSHOT_DIR)) {
  7  |   fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  8  | }
  9  | 
  10 | test.describe("E2E Audit - Admin Panel", () => {
  11 |   test("should successfully log in as Admin, navigate tabs, and capture screenshots", async ({ page }) => {
  12 |     // 1. Go to Login Page
  13 |     await page.goto("/login");
  14 |     await page.screenshot({ path: path.join(SCREENSHOT_DIR, "admin_01_login_page.png") });
  15 | 
  16 |     // 2. Fill login credentials
  17 |     await page.fill("#email", "admin@example.com");
  18 |     await page.fill("#password", "password123");
  19 |     await page.click("button[type='submit']");
  20 | 
  21 |     // 3. Verify landing on Admin Dashboard
> 22 |     await page.waitForURL("**/dashboard**");
     |                ^ Error: page.waitForURL: Test timeout of 30000ms exceeded.
  23 |     await expect(page.locator("h2").filter({ hasText: /Good/ }).first()).toBeVisible();
  24 |     await page.screenshot({ path: path.join(SCREENSHOT_DIR, "admin_02_dashboard_landing.png") });
  25 | 
  26 |     // 4. Click 'Invitations' tab (tab is loaded via query parameter or click)
  27 |     const invitationsTab = page.locator("a[href='/dashboard?tab=invitations'], button:has-text('Invitations')").first();
  28 |     if (await invitationsTab.isVisible()) {
  29 |       await invitationsTab.click();
  30 |       await page.waitForTimeout(1000); // Wait for transition
  31 |       await page.screenshot({ path: path.join(SCREENSHOT_DIR, "admin_03_tab_invitations.png") });
  32 |     }
  33 | 
  34 |     // 5. Click 'Users' tab
  35 |     const usersTab = page.locator("a[href='/dashboard?tab=users'], button:has-text('Users')").first();
  36 |     if (await usersTab.isVisible()) {
  37 |       await usersTab.click();
  38 |       await page.waitForTimeout(1000);
  39 |       await page.screenshot({ path: path.join(SCREENSHOT_DIR, "admin_04_tab_users.png") });
  40 |     }
  41 | 
  42 |     // Go to Students tab to get the dynamic student ID
  43 |     await page.goto("/dashboard?tab=students");
  44 |     const studentLink = page.locator("a[href*='studentId=']").first();
  45 |     await studentLink.waitFor({ state: "visible", timeout: 15000 });
  46 |     const href = await studentLink.getAttribute("href");
  47 |     const studentId = href ? new URL(href, "http://localhost").searchParams.get("studentId") : "1";
  48 | 
  49 |     // 6. Navigate to Student Workspace (using dynamic student ID)
  50 |     await page.goto(`/workspace?studentId=${studentId}`);
  51 |     await page.waitForTimeout(2000); // Allow workspace loading
  52 |     await page.screenshot({ path: path.join(SCREENSHOT_DIR, "admin_05_student_workspace.png") });
  53 | 
  54 |     // 7. Verify main elements are present in the workspace
  55 |     const workspaceHeader = page.locator("h1:has-text('Tommy'), h2:has-text('Tommy')").first();
  56 |     await expect(workspaceHeader).toBeVisible();
  57 |   });
  58 | });
  59 | 
```