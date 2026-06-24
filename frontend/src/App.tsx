// Copyright (c) 2026 Sylvain Borgogno <sylvain.borgogno@inria.fr>
// SPDX-License-Identifier: MIT
/** Root application component with client-side routing. */

import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ApiCacheProvider } from "./context/ApiCacheContext";
import { AuthProvider } from "./context/AuthContext";
import { DepGraphProvider } from "./context/DepGraphContext";
import { ReleaseProvider } from "./context/ReleaseContext";
import ProtectedRoute from "./components/ProtectedRoute";
import AppLayout from "./layout/AppLayout";
import AdminPage from "./pages/AdminPage";
import DashboardPage from "./pages/DashboardPage";
import HelpPage from "./pages/HelpPage";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import PackageDetailPage from "./pages/PackageDetailPage";
import ReleaseBoardPage from "./pages/ReleaseBoardPage";
import "./App.css";

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public routes (no sidebar) */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />

          {/* Protected routes (with sidebar) */}
          <Route
            path="/app"
            element={
              <ProtectedRoute>
                <ReleaseProvider>
                <ApiCacheProvider>
                <DepGraphProvider>
                  <AppLayout />
                </DepGraphProvider>
                </ApiCacheProvider>
                </ReleaseProvider>
              </ProtectedRoute>
            }
          >
            <Route
              index
              element={<Navigate to="/app/releases/in-progress" replace />}
            />
            <Route path="releases/:releaseId" element={<DashboardPage />} />
            <Route
              path="releases/:releaseId/packages/:packageName"
              element={<PackageDetailPage />}
            />
            <Route path="release-board" element={<ReleaseBoardPage />} />
            <Route path="help" element={<HelpPage />} />
            <Route
              path="admin"
              element={
                <ProtectedRoute requiredRole="admin">
                  <AdminPage />
                </ProtectedRoute>
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
