import React from "react";

// Pure presentational Dashboard page.
// Do NOT mount React or define routes here. App shell & routing live in src/main.jsx.
export default function Dashboard() {
  return (
    <div className="page dashboard" style={{ padding: 16 }}>
      <h1>Dashboard</h1>
      <p>Welcome back. Your app shell (header/sidebar) and routes are defined in <code>src/main.jsx</code>.</p>
    </div>
  );
}
