import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Cloudflare Pages serves from the root, so base is '/'. The data layer builds
// paths from import.meta.env.BASE_URL, so it also works under a subpath if the
// deploy target ever changes.
export default defineConfig({
  base: "/",
  plugins: [react()],
});
