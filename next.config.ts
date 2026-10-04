import type { NextConfig } from "next";
const config: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["playwright", "axe-core"],
  poweredByHeader: false,
};
export default config;
