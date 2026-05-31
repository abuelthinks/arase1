# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: vibe-checks\parent-audit.spec.ts >> E2E Audit - Parent Panel >> should successfully log in as Parent, verify dashboard, and navigate child workspace
- Location: src\e2e\vibe-checks\parent-audit.spec.ts:11:7

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
          - text: parent@example.com
      - generic [ref=e22]:
        - generic [ref=e23]: Password
        - textbox "Password" [ref=e24]:
          - /placeholder: ••••••••
          - text: password123
      - button "Sign In" [ref=e25] [cursor=pointer]
  - button "Open Next.js Dev Tools" [ref=e31] [cursor=pointer]:
    - img [ref=e32]
  - alert [ref=e35]
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
  10 | test.describe("E2E Audit - Parent Panel", () => {
  11 |   test("should successfully log in as Parent, verify dashboard, and navigate child workspace", async ({ page }) => {
  12 |     // 1. Log in as Parent
  13 |     await page.goto("/login");
  14 |     await page.fill("#email", "parent@example.com");
  15 |     await page.fill("#password", "password123");
  16 |     await page.click("button[type='submit']");
  17 | 
  18 |     // 2. Wait for landing view
> 19 |     await page.waitForURL("**/dashboard**");
     |                ^ Error: page.waitForURL: Test timeout of 30000ms exceeded.
  20 |     await page.waitForTimeout(1000);
  21 |     await page.screenshot({ path: path.join(SCREENSHOT_DIR, "parent_01_dashboard.png") });
  22 | 
  23 |     // Verify Tommy Johnson's card is visible
  24 |     const childCardHeader = page.locator("h3", { hasText: "Tommy Johnson" });
  25 |     await expect(childCardHeader).toBeVisible();
  26 | 
  27 |     // Verify SMS prompt or profile setup links if available
  28 |     const verifyButton = page.locator("button:has-text('Verify Now')");
  29 |     if (await verifyButton.isVisible()) {
  30 |       await verifyButton.click();
  31 |       await page.waitForTimeout(1000);
  32 |       await page.screenshot({ path: path.join(SCREENSHOT_DIR, "parent_02_sms_modal.png") });
  33 |       // Close modal (standard close buttons like click overlay or pressing escape)
  34 |       await page.keyboard.press("Escape");
  35 |     }
  36 | 
  37 |     // Get dynamic student ID from primary CTA links
  38 |     const ctaButton = page.locator("a[href*='studentId=']").first();
  39 |     await ctaButton.waitFor({ state: "visible", timeout: 15000 });
  40 |     const href = await ctaButton.getAttribute("href");
  41 |     const studentId = href ? new URL(href, "http://localhost").searchParams.get("studentId") : "1";
  42 | 
  43 |     // 3. Navigate to Child's Workspace
  44 |     await page.goto(`/workspace?studentId=${studentId}`);
  45 |     await page.waitForTimeout(2000);
  46 |     await page.screenshot({ path: path.join(SCREENSHOT_DIR, "parent_03_child_workspace.png") });
  47 | 
  48 |     // Verify parent has access to key workspace elements (using Tommy's name or workspace header)
  49 |     const workspaceTitle = page.locator("h1:has-text('Tommy'), h2:has-text('Tommy')").first();
  50 |     await expect(workspaceTitle).toBeVisible();
  51 |   });
  52 | });
  53 | 
```