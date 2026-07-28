import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";

// Cloudflare Pages serves 404.html for any request that does not match a static
// asset. Copying the built index.html to 404.html gives this single-page app a
// reliable deep-link fallback (e.g. a direct load or refresh of /club/:id) with
// clean URLs, without relying on a _redirects rule.
function spaFallback(): Plugin {
  return {
    name: "spa-404-fallback",
    apply: "build",
    closeBundle() {
      const dist = path.resolve(process.cwd(), "dist");
      const index = path.join(dist, "index.html");
      if (fs.existsSync(index)) {
        fs.copyFileSync(index, path.join(dist, "404.html"));
      }
    },
  };
}

// Cloudflare Pages serves from the root, so base is '/'. The data layer builds
// paths from import.meta.env.BASE_URL, so it also works under a subpath if the
// deploy target ever changes.
export default defineConfig({
  base: "/",
  plugins: [react(), spaFallback()],
});
