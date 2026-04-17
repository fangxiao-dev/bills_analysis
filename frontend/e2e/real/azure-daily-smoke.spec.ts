import { expect, test } from "@playwright/test";
import path from "node:path";

test.skip(!process.env.PW_REAL_AZURE, "需显式设置 PW_REAL_AZURE=1");

const fixturesDir = path.resolve(process.cwd(), "e2e", "fixtures");

test("@azure real azure daily smoke reaches review and merge flow", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("upload-page")).toBeVisible();
  await page.getByTestId("bar-dropzone").locator('input[type="file"]').setInputFiles(path.join(fixturesDir, "bar.pdf"));
  await page.getByTestId("zbon-dropzone").locator('input[type="file"]').setInputFiles(path.join(fixturesDir, "zbon.pdf"));
  await page.getByTestId("create-batch-button").click();

  await expect(page.getByTestId("go-review-button")).toBeEnabled({ timeout: 120_000 });
  await page.getByTestId("go-review-button").click();

  await expect(page.getByTestId("manual-review-page")).toBeVisible();
  await expect(page.getByTestId("review-table-bar")).toBeVisible({ timeout: 120_000 });
});
