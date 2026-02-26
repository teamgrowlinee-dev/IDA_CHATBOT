import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    process: JSON.stringify({ env: {} })
  },
  build: {
    lib: {
      entry: "src/embed.tsx",
      name: "GrowlineeChatWidget",
      formats: ["iife"],
      fileName: () => "chat-widget.iife.js"
    },
    cssCodeSplit: false,
    sourcemap: true
  }
});
