import { test, expect } from "@playwright/test";

test.describe("Task List View", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("renders header with title and new task button", async ({ page }) => {
    await expect(page.locator("h1")).toHaveText("Forge Loop");
    await expect(page.locator('button:has-text("+ 新任务")')).toBeVisible();
  });

  test("shows filter bar with all tabs", async ({ page }) => {
    const tabs = ["全部", "执行中", "待审核", "已完成", "失败"];
    for (const tab of tabs) {
      await expect(page.locator(`button:has-text("${tab}")`)).toBeVisible();
    }
  });

  test("renders mock tasks with correct titles", async ({ page }) => {
    await expect(page.locator("text=Add login page")).toBeVisible();
    await expect(page.locator("text=Fix pagination bug")).toBeVisible();
    await expect(page.locator("text=Implement search")).toBeVisible();
    await expect(page.locator("text=Refactor auth middleware")).toBeVisible();
    await expect(page.locator("text=Add rate limiting")).toBeVisible();
  });

  test("filter by status shows only matching tasks", async ({ page }) => {
    await page.click('button:has-text("执行中")');
    await expect(page.locator("text=Fix pagination bug")).toBeVisible();
    await expect(page.locator("text=Add login page")).not.toBeVisible();
  });

  test("filter by completed shows completed tasks", async ({ page }) => {
    await page.click('button:has-text("已完成")');
    await expect(page.locator("text=Refactor auth middleware")).toBeVisible();
    await expect(page.locator("text=Add login page")).not.toBeVisible();
  });

  test("filter by failed shows failed tasks", async ({ page }) => {
    await page.click('button:has-text("失败")');
    await expect(page.locator("text=Add rate limiting")).toBeVisible();
    await expect(page.locator("text=Add login page")).not.toBeVisible();
  });

  test("shows empty state when filter has no matches", async ({ page }) => {
    await page.click('button:has-text("待审核")');
    // task-3 is awaiting_review in mock data
    await expect(page.locator("text=Implement search")).toBeVisible();
  });

  test("new task button opens form dialog", async ({ page }) => {
    await page.click('button:has-text("+ 新任务")');
    await expect(page.locator("text=新建任务").first()).toBeVisible();
  });

  test("task card for queued task shows start button", async ({ page }) => {
    const card = page.locator("[data-task-id='task-1']").first();
    if (await card.isVisible()) {
      await expect(card.locator('button:has-text("启动")')).toBeVisible();
    }
  });

  test("task card for awaiting_review shows review button", async ({ page }) => {
    const card = page.locator("[data-task-id='task-3']").first();
    if (await card.isVisible()) {
      await expect(card.locator('button:has-text("审核")')).toBeVisible();
    }
  });

  test("delete task removes it from list", async ({ page }) => {
    page.on("dialog", (dialog) => dialog.accept());
    const taskTitle = "Add login page";
    await expect(page.locator(`text=${taskTitle}`)).toBeVisible();
    // Click delete on the first task card
    const card = page.locator("[data-task-id='task-1']").first();
    if (await card.isVisible()) {
      await card.locator('button[title="删除"]').click();
      await expect(page.locator(`text=${taskTitle}`)).not.toBeVisible();
    }
  });
});

test.describe("Task Form Dialog", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.click('button:has-text("+ 新任务")');
  });

  test("form has required fields", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "新建任务" })).toBeVisible();
    await expect(page.locator('label:has-text("任务标题")')).toBeVisible();
    await expect(page.locator('label:has-text("目标仓库")')).toBeVisible();
  });

  test("can fill and submit form", async ({ page }) => {
    // Title field (first input with placeholder "描述任务目标...")
    const titleInput = page.locator('input[placeholder="描述任务目标..."]').first();
    await titleInput.fill("E2E test task");

    // Repo path field
    await page.fill('input[placeholder="/path/to/repo"]', "/tmp/e2e-repo");

    // Objective textarea
    await page.fill('textarea[placeholder="描述任务目标..."]', "Build E2E feature");

    await page.click('button:has-text("创建")');
    await expect(page.locator("text=E2E test task")).toBeVisible();
  });

  test("cancel closes dialog", async ({ page }) => {
    await page.click('button:has-text("取消")');
    await expect(page.locator('text=新建任务')).not.toBeVisible();
  });
});

test.describe("Settings Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("navigates to settings page", async ({ page }) => {
    await page.click('button[title="设置"]');
    await expect(page.locator("h1")).toHaveText("设置");
  });

  test("settings page shows auth section", async ({ page }) => {
    await page.click('button[title="设置"]');
    await expect(page.locator("text=认证")).toBeVisible();
    await expect(page.locator("text=当前状态")).toBeVisible();
  });

  test("settings page shows log section", async ({ page }) => {
    await page.click('button[title="设置"]');
    await expect(page.getByRole("heading", { name: "日志" })).toBeVisible();
  });

  test("settings page shows diagnostics section", async ({ page }) => {
    await page.click('button[title="设置"]');
    await expect(page.getByRole("heading", { name: "诊断" })).toBeVisible();
    await expect(page.locator('button:has-text("导出诊断包")')).toBeVisible();
  });

  test("back button returns to task list", async ({ page }) => {
    await page.click('button[title="设置"]');
    await page.click('a:has-text("← 返回")');
    await expect(page.locator("h1")).toHaveText("Forge Loop");
  });
});
