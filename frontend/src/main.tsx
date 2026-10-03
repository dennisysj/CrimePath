import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

// TODO (Phase 4): React Router setup, Cases list screen.
function App() {
  return (
    <div className="flex h-screen items-center justify-center font-mono text-sm text-neutral-400">
      CrimePath — scaffold ready. UI arrives in later phases.
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
