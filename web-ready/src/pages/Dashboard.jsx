import React, { useEffect, useState } from "react";

const BASE = import.meta.env.VITE_API_BASE || "";

function buildInit() {
  // Prefer cookie-based auth; include bearer only if present
  let t = "";
  try {
    t = (typeof localStorage !== "undefined" && (localStorage.getItem("token") || "")) || "";
  } catch (_e) {}
  const headers = {};
  if (t && t.trim()) headers["Authorization"] = `Bearer ${t}`;
  // Always include cookies for httpOnly session/refresh
  return { credentials: "include", headers };
}

export default function Dashboard() {
  const [me, setMe] = useState(null);
  const [usage, setUsage] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // 1) Load /me (blocks page)
        const r1 = await fetch(`${BASE}/me`, buildInit());
        const j1 = await r1.json().catch(() => ({}));
        if (!r1.ok) throw new Error(j1?.error || `GET /me ${r1.status}`);
        if (!cancelled) setMe(j1);

        // 2) Load /usage (non-blocking; show zeros if missing/fails)
        try {
          const r2 = await fetch(`${BASE}/usage`, buildInit());
          const j2 = await r2.json().catch(() => ({}));
          if (!r2.ok) throw new Error(j2?.error || `GET /usage ${r2.status}`);
          if (!cancelled) setUsage(j2);
        } catch (_e2) {
          if (!cancelled) setUsage({});
        }
      } catch (e) {
        if (!cancelled) setError(e.message || "API error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const grid = { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 };
  const card = {
    padding: 16,
    border: "1px solid rgba(255,255,255,.1)",
    borderRadius: 12,
    background: "rgba(255,255,255,.04)",
  };

  if (error) return <div style={card}>Error: {String(error)}</div>;
  if (!me) return <div style={card}>Loading...</div>;

  const u = usage || {};
  const plan = me.effective_plan || me.plan;

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Dashboard</h2>
      <div style={{ opacity: 0.8, marginBottom: 10 }}>
        Tenant: <b>{me.name || me.id}</b> · Plan: <b>{plan}</b>
      </div>
      <div style={grid}>
        <div style={card}>
          <div>API Calls (30d)</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{u.api_calls ?? 0}</div>
        </div>
        <div style={card}>
          <div>Alerts (24h)</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{u.alerts_24h ?? 0}</div>
        </div>
        <div style={card}>
          <div>Remediated (24h)</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{u.remediated_24h ?? 0}</div>
        </div>
        <div style={card}>
          <div>Active Keys</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{u.active_keys ?? 0}</div>
        </div>
      </div>
    </div>
  );
}
