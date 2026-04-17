import { expect, test } from "@playwright/test";
import path from "node:path";
import { attachMockApi, openUploadPage, uploadFiles } from "../support/mockApi";

const fixturesDir = path.resolve(process.cwd(), "e2e", "fixtures");

test("daily cannot submit without zbon file", async ({ page }) => {
  await attachMockApi(page, { batchType: "daily" });
  await openUploadPage(page);

  await uploadFiles(page, "bar-dropzone", path.join(fixturesDir, "bar.pdf"));
  await expect(page.getByTestId("create-batch-button")).toBeDisabled();
});

test("manual review blocks when no batch exists", async ({ page }) => {
  await attachMockApi(page, { batchType: "daily" });
  await page.goto("/manual-review");

  await expect(page.getByTestId("manual-review-page")).toBeVisible();
  await expect(page.getByText(/Kein Batch gefunden|No batch found/i)).toBeVisible();
  await expect(page.getByTestId("submit-review-button")).toBeDisabled();
});
