import { expect, test } from "@playwright/test";
import path from "node:path";
import { attachMockApi, openUploadPage, uploadFiles } from "../support/mockApi";

const fixturesDir = path.resolve(process.cwd(), "e2e", "fixtures");

test("daily upload to merged happy path", async ({ page }) => {
  await attachMockApi(page, { batchType: "daily" });
  await openUploadPage(page);

  await uploadFiles(page, "bar-dropzone", path.join(fixturesDir, "bar.pdf"));
  await uploadFiles(page, "zbon-dropzone", path.join(fixturesDir, "zbon.pdf"));

  await expect(page.getByTestId("create-batch-button")).toBeEnabled();
  await page.getByTestId("create-batch-button").click();

  await expect(page.getByTestId("go-review-button")).toBeEnabled();
  await page.getByTestId("go-review-button").click();

  await expect(page.getByTestId("manual-review-page")).toBeVisible();
  await expect(page.getByTestId("review-table-bar")).toBeVisible();
  await expect(page.getByTestId("review-table-zbon")).toBeVisible();

  await page.getByTestId("local-merge-source-button").click();
  await page.getByLabel(/Choose local Excel|Lokale Excel/i).setInputFiles(path.join(fixturesDir, "monthly.xlsx"));
  await page.getByTestId("submit-review-button").click();

  await expect(page.getByTestId("open-merged-result-button")).toBeVisible();
});
