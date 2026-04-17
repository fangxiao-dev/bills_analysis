import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Vite configuration for the frontend M1 app.
 */
export function resolveDevServerPort(env) {
  /** Resolve stable local dev port for self-use/test frontend instances. */

  const parsedPort = Number.parseInt(String(env.VITE_DEV_PORT || "5173"), 10);
  if (Number.isInteger(parsedPort) && parsedPort > 0) {
    return parsedPort;
  }
  return 5173;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react()],
    server: {
      host: "127.0.0.1",
      port: resolveDevServerPort(env),
      strictPort: true,
    },
    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: "./src/test/setup.js",
      css: true,
      exclude: ["e2e/**", "node_modules/**", "dist/**"],
      coverage: {
        reporter: ["text", "html"],
      },
    },
  };
});
