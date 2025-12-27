import { createRoot } from "react-dom/client";
import ErrorBoundary from "@/components/ErrorBoundary";
import App from "./App.tsx";
import "./index.css";

const logFatalError = (label: string, error: unknown) => {
  console.error(`[fatal] ${label}`, error);
};

window.addEventListener("error", (event) => {
  logFatalError("window.error", event.error ?? event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  logFatalError("window.unhandledrejection", event.reason);
});

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found");
}

createRoot(rootElement).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
