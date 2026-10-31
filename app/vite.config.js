import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Matches scripts/dev-api-server.mjs's default port. If you set
      // API_PORT to something else when running dev:server, update this too.
      "/api": "http://localhost:3001",
    },
  },
});
