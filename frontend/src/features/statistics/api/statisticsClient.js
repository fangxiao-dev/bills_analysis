import { API_BASE_URL, API_MODE } from "../../../config/env";
import { createMockStatisticsClient } from "./statisticsClient.mock";
import { createRealStatisticsClient } from "./statisticsClient.real";

/**
 * Create the statistics client implementation based on selected API mode.
 * @param {{ mode?: "mock" | "real"; baseUrl?: string; fetchImpl?: typeof fetch }} [options]
 */
export function createStatisticsClient(options = {}) {
  const mode = options.mode || API_MODE;
  const baseUrl = options.baseUrl || API_BASE_URL;

  if (mode === "real") {
    return createRealStatisticsClient({ baseUrl, fetchImpl: options.fetchImpl });
  }

  return createMockStatisticsClient();
}

export const statisticsClient = createStatisticsClient();

/**
 * Preview monthly statistics using the default mode-selected client.
 * @param {{ dailyExcel: File; officeExcel: File }} payload
 */
export function previewMonthlyStatistics(payload) {
  return statisticsClient.previewMonthlyStatistics(payload);
}
