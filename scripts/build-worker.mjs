import { build } from "esbuild";
await build({
  entryPoints: ["scripts/worker.ts"],
  outfile: ".audit-worker/worker.cjs",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "cjs",
  external: ["playwright", "@next/env"],
});
