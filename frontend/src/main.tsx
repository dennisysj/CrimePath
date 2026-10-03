import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import { CaseWebPage } from "./features/case-web"; // ADDED line 4: wire in the real case-web feature page

// DELETED lines 5-12: removed "// TODO (Phase 4)..." comment and the placeholder `function App() {...}`

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <CaseWebPage /> {/* UPDATED line 16: was <App /> */}
  </React.StrictMode>
);
