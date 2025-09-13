import React from "react";
import Dashboard from "./pages/Dashboard.jsx";

// This file should only export the Dashboard component.
// Do NOT mount React here (no ReactDOM.createRoot), and do NOT create a new Router.
// Routing and the app shell (headers/sidebars) are handled in main.jsx.

export default function Dashboard() {
  return (
    <div className="page dashboard">
      <h1>Dashboard</h1>
      <p>Loading...</p>
    </div>
  );
}
