import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/auth": "http://127.0.0.1:8000",
      "/add-User": "http://127.0.0.1:8000",
      "/users": "http://127.0.0.1:8000",
      "/groups": "http://127.0.0.1:8000",
      "/favicon.ico": "http://127.0.0.1:8000",
    },
  },
});