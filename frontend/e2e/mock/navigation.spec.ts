import { expect, test } from "@playwright/test";
import { attachMockApi, openUploadPage } from "../support/mockApi";

test("upload page renders and language switch works", async ({ page }) => {
  await attachMockApi(page, { batchType: "daily" });
  await openUploadPage(page);

  await expect(page.getByTestId("batch-type-selector")).toBeVisible();
  await expect(page.getByTestId("create-batch-button")).toBeDisabled();

  await page.getByTestId("language-button-en").click();
  await expect(page.getByTestId("upload-page")).toContainText(/Upload/i);
});
