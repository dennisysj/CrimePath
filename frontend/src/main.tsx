import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner"; // ADDED line 4: global toast host for the timeline redesign (collapse/expand, path view, add-evidence feedback)
import "./index.css";
import { CaseWebPage } from "./features/case-web";

const TestImageLocation = lazy(() =>
  import("./test/TestImageLocation").then((module) => ({
    default: module.TestImageLocation,
  })),
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route
          path="/test/image-location"
          element={
            <Suspense
              fallback={
                <div className="flex h-screen items-center justify-center bg-neutral-950 text-sm text-neutral-500">
                  Loading test page…
                </div>
              }
            >
              <TestImageLocation />
            </Suspense>
          }
        />
        <Route path="*" element={<CaseWebPage />} />
      </Routes>
      <Toaster theme="dark" position="bottom-center" duration={1600} /> {/* UPDATED line 34: theme light->dark for the high-contrast dark theme */}
    </BrowserRouter>
  </React.StrictMode>,
);
