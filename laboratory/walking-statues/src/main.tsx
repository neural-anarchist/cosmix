import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "katex/dist/katex.min.css";
import { App } from "./App";

const container = document.getElementById("root");
if (!container) {
  throw new Error('Missing "#root" element in index.html');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
