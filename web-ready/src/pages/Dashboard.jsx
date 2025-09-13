import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import DashboardReal from "./pages/Dashboard.jsx";

function DashboardLocal() {
  return <div>Placeholder Dashboard</div>;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DashboardReal />} />
        <Route path="/dashboard" element={<DashboardReal />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
