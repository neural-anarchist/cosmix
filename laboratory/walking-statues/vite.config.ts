import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so the built bundle can be dropped into the static
// cosmix site at laboratory/walking-statues/dist/ without path rewriting.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    target: "esnext"
  }
});
