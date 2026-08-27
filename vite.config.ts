import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const bindingConfig = () => ({
  main: "./worker/index.ts",
  triggers: { crons: ["17 5 * * *"] },
  compatibility_flags: ["nodejs_compat"],
  vars: {
    ZOOMIGO_API_BASE_URL: process.env.ZOOMIGO_API_BASE_URL ?? "",
    DEV_ACCESS_ENABLED: process.env.DEV_ACCESS_ENABLED ?? "false",
    E2E_PLAYER_DEV_CONTROLS_ENABLED:
      process.env.E2E_PLAYER_DEV_CONTROLS_ENABLED ?? "false",
    PRODUCT_ANALYTICS_ENABLED: process.env.PRODUCT_ANALYTICS_ENABLED ?? "false",
    ANALYTICS_SUBJECT_KEY: process.env.ANALYTICS_SUBJECT_KEY ?? "",
  },
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "zoomigo-product-analytics",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
          // The deploy config is emitted at dist/server/wrangler.json.
          migrations_dir: "../../drizzle",
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
});

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: bindingConfig(),
      }),
    ],
  };
});
