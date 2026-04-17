import { expect, test } from "@playwright/test";
import path from "node:path";
import { attachMockApi, openUploadPage, uploadFiles } from "../support/mockApi";

const fixturesDir = path.resolve(process.cwd(), "e2e", "fixtures");

test("office upload to merged happy path", async ({ page }) => {
  await attachMockApi(page, { batchType: "office" });
  await openUploadPage(page);

  await page.getByTestId("batch-type-office").click();
  await expect(page.getByTestId("office-receiver-city-select")).toBeVisible();
  await uploadFiles(page, "office-dropzone", path.join(fixturesDir, "office.pdf"));

  await page.getByTestId("create-batch-button").click();
  await expect(page.getByTestId("go-review-button")).toBeEnabled();
  await page.getByTestId("go-review-button").click();

  await expect(page.getByTestId("manual-review-page")).toBeVisible();
  await expect(page.getByTestId("review-table-office")).toBeVisible();

  await page.getByTestId("local-merge-source-button").click();
  await page.getByLabel(/Choose local Excel|Lokale Excel/i).setInputFiles(path.join(fixturesDir, "monthly.xlsx"));
  await page.getByTestId("submit-review-button").click();

  await expect(page.getByTestId("open-merged-result-button")).toBeVisible();
});
