import { expect, type Page } from "@playwright/test";

type BatchType = "daily" | "office";
type BatchStatus = "queued" | "running" | "review_ready" | "merging" | "merged";

type MockScenario = {
  batchType: BatchType;
};

type BatchInput = {
  path: string;
  category: "bar" | "zbon" | "office" | null;
  status: "queued" | "processing" | "extracted";
  error: string | null;
};

/**
 * Install deterministic API route mocks for one browser page.
 */
export async function attachMockApi(page: Page, scenario: MockScenario): Promise<void> {
  const state = createScenarioState(scenario.batchType);
  await page.route("**/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method().toUpperCase();

    if (method === "GET" && path === "/v1/batches/office-receiver-options") {
      await fulfillJson(route, 200, {
        default_city: "Dortmund",
        options: [
          {
            city: "Dortmund",
            receiver_name: "Ramen Ippin Dortmund GmbH",
            receiver_address: "Reinoldistr.8 44135 Dortmund",
          },
        ],
      });
      return;
    }

    if (method === "POST" && path === "/v1/statistics/monthly-preview") {
      await fulfillJson(route, 200, {
        schema_version: "v1",
        summary: {
          revenue_brutto: 100411.24,
          daily_expense_brutto: 1183.74,
          office_expense_brutto: 111535.95,
          profit_brutto: -12308.45,
        },
        daily_series: [
          {
            date: "2025-11-01",
            revenue_brutto: 2437.3,
            daily_expense_brutto: 0,
            profit_before_office_brutto: 2437.3,
          },
        ],
        office_by_type: [
          { type: "Personal", brutto: 60000.0, count: 4, share: 0.538 },
          { type: "Miete", brutto: 28000.0, count: 2, share: 0.251 },
        ],
        office_rows: [
          { date: "2025-11-05", type: "Personal", name: "Gehalt Nov", brutto: 15000.0 },
          { date: "2025-11-10", type: "Miete", name: "Ramen KL", brutto: 14000.0 },
        ],
        expense_breakdown: [
          { category: "Personal", source: "office", brutto: 60000.0, count: 4, share: 0.6727 },
          { category: "Miete", source: "office", brutto: 28000.0, count: 2, share: 0.3139 },
          { category: "Bar Ausgabe", source: "daily_bar", brutto: 1183.74, count: 1, share: 0.0133 },
        ],
        daily_expense_rows: [{ date: "2025-11-02", brutto: 168.83 }],
        warnings: [],
      });
      return;
    }

    if (method === "POST" && path === "/v1/batches/upload") {
      state.created = true;
      await fulfillJson(route, 200, {
        schema_version: "v1",
        task_id: "mock-upload-task",
        batch_id: state.batch.batch_id,
        type: state.batch.type,
        status: state.batch.status,
        created_at: state.batch.created_at,
      });
      return;
    }

    if (method === "GET" && path === `/v1/batches/${state.batch.batch_id}`) {
      advanceBatchState(state);
      await fulfillJson(route, 200, state.batch);
      return;
    }

    if (method === "GET" && path === `/v1/batches/${state.batch.batch_id}/review-rows`) {
      await fulfillJson(route, 200, {
        batch_id: state.batch.batch_id,
        status: state.batch.status,
        rows: state.reviewRows,
      });
      return;
    }

    if (method === "PUT" && path === `/v1/batches/${state.batch.batch_id}/review`) {
      state.reviewSubmitted = true;
      state.batch.review_rows_count = state.reviewRows.length;
      state.batch.status = "review_ready";
      state.batch.updated_at = nextIso(state);
      await fulfillJson(route, 200, state.batch);
      return;
    }

    if (method === "POST" && path === `/v1/batches/${state.batch.batch_id}/merge-source/local`) {
      await fulfillJson(route, 200, {
        batch_id: state.batch.batch_id,
        monthly_excel_path: "D:/mock/monthly.xlsx",
        created_at: nextIso(state),
      });
      return;
    }

    if (method === "POST" && path === `/v1/batches/${state.batch.batch_id}/merge`) {
      state.mergeRequested = true;
      state.batch.status = "merging";
      state.batch.updated_at = nextIso(state);
      await fulfillJson(route, 200, {
        schema_version: "v1",
        task_id: "mock-merge-task",
        batch_id: state.batch.batch_id,
        task_type: "merge_batch",
        created_at: state.batch.updated_at,
      });
      return;
    }

    if (method === "GET" && path === `/v1/batches/${state.batch.batch_id}/merge-output/download`) {
      await route.fulfill({
        status: 200,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        body: "mock-merge-output",
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ detail: `Unhandled mock route: ${method} ${path}` }),
    });
  });
}

/**
 * Open the upload page and ensure the root marker is visible.
 */
export async function openUploadPage(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByTestId("upload-page")).toBeVisible();
}

/**
 * Upload files into one named dropzone.
 */
export async function uploadFiles(page: Page, dropzoneTestId: string, filePaths: string | string[]): Promise<void> {
  await page.getByTestId(dropzoneTestId).locator('input[type="file"]').setInputFiles(filePaths);
}

function createScenarioState(batchType: BatchType) {
  const batchId = `mock-${batchType}-batch`;
  const createdAt = "2026-04-17T08:00:00Z";
  const inputs =
    batchType === "daily"
      ? [
          { path: "D:/mock/01_zbon.pdf", category: "zbon", status: "queued", error: null },
          { path: "D:/mock/01_bar.pdf", category: "bar", status: "queued", error: null },
        ]
      : [{ path: "D:/mock/01_office.pdf", category: "office", status: "queued", error: null }];
  const reviewRows =
    batchType === "daily"
      ? [
          {
            row_id: "row-0001",
            category: "zbon",
            filename: "zbon.pdf",
            result: { brutto: 12.34, netto: 10.0, run_date: "04/02/2026" },
            score: {},
            preview_url: `http://127.0.0.1:4173/v1/batches/${batchId}/files/row-0001/preview`,
          },
          {
            row_id: "row-0002",
            category: "bar",
            filename: "bar.pdf",
            result: { store_name: "Demo Store", brutto: 12.34, netto: 10.0, bill_id: "RE-1001", run_date: "04/02/2026" },
            score: {},
            preview_url: `http://127.0.0.1:4173/v1/batches/${batchId}/files/row-0002/preview`,
          },
        ]
      : [
          {
            row_id: "row-0001",
            category: "office",
            filename: "office.pdf",
            result: {
              type: "office-cost",
              sender: "Vendor GmbH",
              brutto: 120.5,
              netto: 100.0,
              tax_id: "INV-1001",
              receiver_ok: true,
            },
            score: {},
            preview_url: `http://127.0.0.1:4173/v1/batches/${batchId}/files/row-0001/preview`,
          },
        ];

  return {
    counter: 0,
    created: false,
    mergeRequested: false,
    reviewSubmitted: false,
    batch: {
      schema_version: "v1",
      batch_id: batchId,
      type: batchType,
      status: "queued" as BatchStatus,
      run_date: "04/02/2026",
      inputs,
      artifacts: {},
      review_rows_count: 0,
      merge_output: {},
      error: null,
      created_at: createdAt,
      updated_at: createdAt,
    },
    reviewRows,
  };
}

function advanceBatchState(state: ReturnType<typeof createScenarioState>) {
  if (!state.created) {
    return;
  }
  state.counter += 1;
  if (state.mergeRequested) {
    if (state.counter >= 4) {
      state.batch.status = "merged";
      state.batch.merge_output = {
        merged_excel_path: `/v1/batches/${state.batch.batch_id}/merge-output/download`,
        output_path: `/v1/batches/${state.batch.batch_id}/merge-output/download`,
      };
    } else {
      state.batch.status = "merging";
    }
    state.batch.updated_at = nextIso(state);
    return;
  }

  if (state.counter === 1) {
    state.batch.status = "running";
    state.batch.inputs = state.batch.inputs.map((input) => ({ ...input, status: "processing" }));
  } else {
    state.batch.status = "review_ready";
    state.batch.inputs = state.batch.inputs.map((input) => ({ ...input, status: "extracted" }));
  }
  state.batch.updated_at = nextIso(state);
}

async function fulfillJson(route: Parameters<Page["route"]>[1] extends (arg: infer T) => any ? T : never, status: number, body: unknown) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

function nextIso(state: ReturnType<typeof createScenarioState>): string {
  return new Date(Date.parse("2026-04-17T08:00:00Z") + state.counter * 1000).toISOString();
}
