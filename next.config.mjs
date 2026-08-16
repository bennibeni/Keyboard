import path from "path";

/** @type {import("next").NextConfig} */
const nextConfig = {
  turbopack: {
    resolveAlias: {
      "@": path.join(process.cwd(), "src"),
      "@app": path.join(process.cwd(), "src", "app"),
      "@components": path.join(process.cwd(), "src", "app", "components"),
      "@utils": path.join(process.cwd(), "src", "app", "utils"),
    },
  },
};

export default nextConfig;
