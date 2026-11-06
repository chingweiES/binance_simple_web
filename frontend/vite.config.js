import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 開發時 /api 轉發到本機 Flask（python wsgi.py → :8000）
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": "http://127.0.0.1:8000" }
  }
});
