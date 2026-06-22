// Copyright (c) 2026 Sylvain Borgogno <sylvain.borgogno@inria.fr>
// SPDX-License-Identifier: MIT
/** Root application component with client-side routing. */

import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { DepGraphProvider } from "./context/DepGraphContext";
import AppLayout from "./layout/AppLayout";
import DashboardPage from "./pages/DashboardPage";
import HelpPage from "./pages/HelpPage";
import PackageDetailPage from "./pages/PackageDetailPage";
import ReleaseBoardPage from "./pages/ReleaseBoardPage";
import "./App.css";

function App() {
  return (
    <DepGraphProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route
              path="/"
              element={<Navigate to="/releases/in-progress" replace />}
            />
            <Route path="/releases/:releaseId" element={<DashboardPage />} />
            <Route
              path="/releases/:releaseId/packages/:packageName"
              element={<PackageDetailPage />}
            />
            <Route path="/release-board" element={<ReleaseBoardPage />} />
            <Route path="/help" element={<HelpPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </DepGraphProvider>
  );
}

export default App;
