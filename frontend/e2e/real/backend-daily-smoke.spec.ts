import { expect, test } from "@playwright/test";
import path from "node:path";

const fixturesDir = path.resolve(process.cwd(), "e2e", "fixtures");

test("real backend daily smoke reaches merged state", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("upload-page")).toBeVisible();
  await page.getByTestId("bar-dropzone").locator('input[type="file"]').setInputFiles(path.join(fixturesDir, "bar.pdf"));
  await page.getByTestId("zbon-dropzone").locator('input[type="file"]').setInputFiles(path.join(fixturesDir, "zbon.pdf"));
  await page.getByTestId("create-batch-button").click();

  await expect(page.getByTestId("go-review-button")).toBeEnabled({ timeout: 120_000 });
  await page.getByTestId("go-review-button").click();

  await expect(page.getByTestId("manual-review-page")).toBeVisible();
  await expect(page.getByTestId("review-table-bar")).toBeVisible({ timeout: 120_000 });

  await page.getByTestId("local-merge-source-button").click();
  await page.getByLabel(/Choose local Excel|Lokale Excel/i).setInputFiles(path.join(fixturesDir, "monthly.xlsx"));
  await page.getByTestId("submit-review-button").click();

  await expect(page.getByTestId("open-merged-result-button")).toBeVisible({ timeout: 120_000 });
});
