import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 开发时把 /mcp-doc/api 代理到 FastAPI，与生产路径一致
export default defineConfig({
  plugins: [react()],
  base: "/mcp-doc/",
  server: {
    port: 5173,
    proxy: {
      "/mcp-doc/api": {
        target: "http://127.0.0.1:8765",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
