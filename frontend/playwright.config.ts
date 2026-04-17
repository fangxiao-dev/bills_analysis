import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(frontendRoot, "..");

/**
 * Playwright configuration for layered E2E coverage.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: [
    {
      command: "pnpm exec vite --host 127.0.0.1 --port 4173",
      port: 4173,
      reuseExistingServer: !process.env.CI,
      cwd: frontendRoot,
      env: {
        ...process.env,
        VITE_API_MODE: "real",
        VITE_API_BASE_URL: "http://127.0.0.1:8000",
      },
    },
    {
      command: "uv run invoice-web-api",
      port: 8000,
      reuseExistingServer: !process.env.CI,
      cwd: repoRoot,
      env: {
        ...process.env,
        HOST: "127.0.0.1",
        PORT: "8000",
        RUN_INLINE_WORKER: "true",
        AZURE_MOCK: "1",
      },
    },
    {
      command: "pnpm exec vite --host 127.0.0.1 --port 4174",
      port: 4174,
      reuseExistingServer: !process.env.CI,
      cwd: frontendRoot,
      env: {
        ...process.env,
        VITE_API_MODE: "real",
        VITE_API_BASE_URL: "http://127.0.0.1:8001",
      },
    },
    {
      command: "uv run invoice-web-api",
      port: 8001,
      reuseExistingServer: !process.env.CI,
      cwd: repoRoot,
      env: {
        ...process.env,
        HOST: "127.0.0.1",
        PORT: "8001",
        RUN_INLINE_WORKER: "true",
      },
    },
  ],
  projects: [
    {
      name: "mock-chromium",
      testDir: "./e2e/mock",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://127.0.0.1:4173",
      },
    },
    {
      name: "real-chromium",
      testDir: "./e2e/real",
      grepInvert: /@azure/,
      timeout: 120_000,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://127.0.0.1:4173",
      },
    },
    {
      name: "azure-chromium",
      testDir: "./e2e/real",
      grep: /@azure/,
      timeout: 120_000,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://127.0.0.1:4174",
      },
    },
  ],
});
