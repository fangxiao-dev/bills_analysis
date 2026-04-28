import { expect, test } from "@playwright/test";
import { attachMockApi } from "../support/mockApi";

test.describe("Statistics Dashboard (mock)", () => {
  test.beforeEach(async ({ page }) => {
    await attachMockApi(page, { batchType: "daily" });
  });

  test("happy path: upload files, generate, see KPIs", async ({ page }) => {
    await page.goto("/statistics");
    await expect(page.getByTestId("statistics-page")).toBeVisible();

    const dailyBuffer = Buffer.from("placeholder");
    const officeBuffer = Buffer.from("placeholder");

    await page.getByTestId("file-input-daily").setInputFiles({
      name: "daily.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: dailyBuffer,
    });
    await page.getByTestId("file-input-office").setInputFiles({
      name: "office.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: officeBuffer,
    });

    await page.getByTestId("generate-button").click();

    await expect(page.getByTestId("kpi-revenue")).toBeVisible();
    await expect(page.getByTestId("kpi-profit")).toBeVisible();
  });

  test("clicking an office type reveals detail rows", async ({ page }) => {
    await page.goto("/statistics");
    const buffer = Buffer.from("placeholder");

    await page.getByTestId("file-input-daily").setInputFiles({
      name: "daily.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer,
    });
    await page.getByTestId("file-input-office").setInputFiles({
      name: "office.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer,
    });
    await page.getByTestId("generate-button").click();

    await expect(page.getByTestId("kpi-revenue")).toBeVisible();
    await page.getByText("Miete").click();
    await expect(page.getByText("Ramen KL")).toBeVisible();
  });
});
