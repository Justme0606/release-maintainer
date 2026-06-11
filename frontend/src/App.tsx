import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { DepGraphProvider } from "./context/DepGraphContext";
import AppLayout from "./layout/AppLayout";
import DashboardPage from "./pages/DashboardPage";
import PackageDetailPage from "./pages/PackageDetailPage";
import PackagePickPage from "./pages/PackagePickPage";
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
            <Route path="/package-pick" element={<PackagePickPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </DepGraphProvider>
  );
}

export default App;
