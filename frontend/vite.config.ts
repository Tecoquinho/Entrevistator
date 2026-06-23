import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/analytics": {
        target: "http://localhost:8080",
        changeOrigin: true
      },
      "/quiz": {
        target: "http://localhost:8080",
        changeOrigin: true
      },
      "/questions": {
        target: "http://localhost:8080",
        changeOrigin: true
      },
      "/answers": {
        target: "http://localhost:8080",
        changeOrigin: true
      }
    }
  }
});
