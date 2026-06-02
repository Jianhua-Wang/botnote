import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4290,
    host: "127.0.0.1",
    proxy: {
      "/v1": { target: "http://127.0.0.1:4280", changeOrigin: true },
      "/health": { target: "http://127.0.0.1:4280", changeOrigin: true },
      "/docs": { target: "http://127.0.0.1:4280", changeOrigin: true }
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false
  }
});
