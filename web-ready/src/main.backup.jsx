import React, { useEffect, useMemo, useState } from "react";

const API_BASE =
  (typeof import !== "undefined" &&
    import.meta?.env?.VITE_API_BASE) ||
  "http://localhost:8080";

function useAuthHeaders() {
  const token = useMemo(() => localStorage.getItem("token") || "", []);
  return useMemo(
    () => ({
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      token,
    }),
    [token]
  );
}

export default function Policy() {
  const { headers, token } = useAuthHeaders();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [policy, setPolicy] = useState({
    enabled: true,
    threshold: -0.9,
    feeds: { email: true, edr: true, dns: true, ueba: true },
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError("");
        setOkMsg("");
        if (!token) {
          setError("Not logged in. Log in first so the token exists in localStorage.");
          return;
        }
        const r = await fetch(`${API_BASE}/policy`, { headers });
        if (!r.ok) throw new Error(`GET /policy failed (${r.status})`);
        const j = await r.json();
        if (alive) setPolicy(j);
      } catch (e) {
        setError(String(e.message || e));
      } finally {
        setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [token]);

  async function save(next) {
    try {
      setSaving(true);
      setError("");
      setOkMsg("");
      const r = await fetch(`${API_BASE}/policy`, {
        method: "POST",
        headers,
        body: JSON.stringify(next),
      });
      if (!r.ok) throw new Error(`POST /policy failed (${r.status})`);
      const j = await r.json();
      setPolicy(j);
      setOkMsg("Saved ✓");
      setTimeout(() => setOkMsg(""), 1500);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setSaving(false);
    }
  }

  const thresholdPct = Math.round(((policy.threshold + 1) / 1) * 100);

  return (
    <div style={wrap}>
      <div style={card}>
        <h1 style={title}>Auto-Remediation Policy</h1>
        <p style={muted}>API: <code>{API_BASE}</code></p>

        {loading && <div style={pill}>Loading policy…</div>}
        {error && <div style={errBox}>{error}</div>}
        {okMsg && <div style={okBox}>{okMsg}</div>}

        {!loading && !error && (
          <>
            <div style={row}>
              <label style={label}>
                <input
                  type="checkbox"
                  checked={policy.enabled}
                  onChange={(e)=>setPolicy(p=>({...p, enabled:e.target.checked}))}
                />
                <span style={{ marginLeft: 8 }}>Enable auto-remediation</span>
              </label>
            </div>

            <div style={rowCol}>
              <div style={label}>Threshold</div>
              <div style={{ marginTop: 6 }}>
                <input
                  type="range"
                  min={-100}
                  max={0}
                  value={Math.round(policy.threshold*100)}
                  onChange={(e)=>setPolicy(p=>({...p, threshold:Number(e.target.value)/100}))}
                  style={{ width:"100%" }}
                />
                <div style={miniRow}>
                  <span style={mutedSm}>Aggressive</span>
                  <span style={codeChip}>{policy.threshold.toFixed(2)} ({thresholdPct}%)</span>
                  <span style={mutedSm}>Conservative</span>
                </div>
                <p style={hint}>
                  Alerts with score ≤ threshold are auto-remediated.
                  Try <code>-0.60</code> to quarantine your EDR sample.
                </p>
              </div>
            </div>

            <div style={rowCol}>
              <div style={label}>Apply to feeds</div>
              <div style={grid2}>
                {["email","edr","dns","ueba"].map(k=>(
                  <label key={k} style={chip}>
                    <input
                      type="checkbox"
                      checked={!!policy.feeds[k]}
                      onChange={(e)=>setPolicy(p=>({...p, feeds:{...p.feeds, [k]:e.target.checked}}))}
                    />
                    <span style={{ marginLeft:8, textTransform:"uppercase" }}>{k}</span>
                  </label>
                ))}
              </div>
            </div>

            <div style={footerRow}>
              <button onClick={()=>save(policy)} disabled={saving} style={primaryBtn}>
                {saving ? "Saving…" : "Save Policy"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ---- minimal styles ---- */
const wrap={minHeight:"100vh",background:"linear-gradient(180deg,#0c0c10 0%,#0e0f16 60%,#14161e 100%)",color:"#e6e9ef",padding:"32px",display:"flex",alignItems:"flex-start",justifyContent:"center",fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Inter,Helvetica,Arial,sans-serif"};
const card={width:"min(880px,95vw)",padding:"24px 24px 28px",background:"linear-gradient(180deg,rgba(28,30,38,.8) 0%,rgba(24,26,34,.8) 100%)",border:"1px solid rgba(255,255,255,.08)",borderRadius:16,boxShadow:"0 10px 30px rgba(0,0,0,.35)",backdropFilter:"blur(8px)"};
const title={fontSize:28,fontWeight:700,letterSpacing:.2,margin:0,marginBottom:8};
const muted={opacity:.7,fontSize:13,marginTop:2}; const mutedSm={opacity:.7,fontSize:12};
const label={fontWeight:600,opacity:.9,fontSize:14};
const row={display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 0",borderTop:"1px dashed rgba(255,255,255,.08)"};
const rowCol={...row,flexDirection:"column",alignItems:"stretch"};
const miniRow={display:"flex",justifyContent:"space-between",marginTop:6};
const codeChip={fontFamily:"ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",padding:"2px 6px",border:"1px solid rgba(255,255,255,.1)",borderRadius:6,opacity:.9};
const hint={opacity:.85,fontSize:13,marginTop:8};
const grid2={display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:8};
const chip={display:"flex",alignItems:"center",border:"1px solid rgba(255,255,255,.1)",borderRadius:10,padding:"8px 10px",background:"rgba(255,255,255,.02)"};
const footerRow={display:"flex",justifyContent:"flex-end",marginTop:16};
const primaryBtn={padding:"10px 14px",borderRadius:10,border:"1px solid rgba(255,255,255,.15)",background:"#1f6feb",color:"white",cursor:"pointer"};
const pill={display:"inline-block",padding:"6px 10px",borderRadius:999,background:"rgba(255,255,255,.08)"};
const errBox={padding:"10px 12px",border:"1px solid #ff5a5a55",background:"#ff5a5a11",borderRadius:10,margin:"8px 0"};
const okBox={padding:"10px 12px",border:"1px solid #2ecc7155",background:"#2ecc7111",borderRadius:10,margin:"8px 0"};