import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/jspdf") || id.includes("node_modules/pdfjs-dist")) {
            return "pdf";
          }
          if (id.includes("node_modules/jszip") || id.includes("node_modules/papaparse")) {
            return "archive";
          }
        }
      }
    }
  }
});
