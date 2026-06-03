import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AppLayout from "./layout/AppLayout";
import DashboardPage from "./pages/DashboardPage";
import PackageDetailPage from "./pages/PackageDetailPage";
import "./App.css";

function App() {
  return (
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
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
