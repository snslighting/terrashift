import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  base: "/terrashift/",
  plugins: [react()],
  build: {
    outDir: "../website-v2",
    assetsDir: "assets",
    emptyOutDir: true,
    chunkSizeWarningLimit: 1100,
  },
  server: { port: 4175 },
});
