import React from "react";
export default function AdminConsolePage({ page }) {
  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ marginTop: 0 }}>Admin Console</h1>
      <div style={{ opacity:.8 }}>
        The Admin Console module isn’t available in this build.
        {page ? <> (tab: <b>{String(page)}</b>)</> : null}
      </div>
    </div>
  );
}
