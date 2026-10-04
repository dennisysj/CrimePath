import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
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
    </BrowserRouter>
  </React.StrictMode>,
);
