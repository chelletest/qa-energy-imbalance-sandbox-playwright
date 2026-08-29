import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import EETestSandbox from "./EETestSandbox";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <EETestSandbox />
  </StrictMode>
);
