import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";

// ponytail: minimal ambient decl so vite.config reads the preview harness's
// assigned port (autoPort) without pulling in all of @types/node.
declare const process: { env: Record<string, string | undefined> };

export default defineConfig({
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
  },
  plugins: [
    cloudflare({
      configPath: "./wrangler.toml",
    }),
  ],
});
