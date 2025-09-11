/**
 * Global fetch wrapper: always attach Authorization: Bearer <token>
 * for API calls, never send a blank Authorization, and make sure we
 * run only once and as early as possible.
 */
(() => {
  if (typeof window === "undefined") return;
  if (window.__fetch_patched) return;
  window.__fetch_patched = true;

  // 1a) Migrate legacy keys -> single 'token'
  try {
    const t =
      localStorage.getItem("token") ||
      localStorage.getItem("auth_token") ||
      localStorage.getItem("cg_token") ||
      localStorage.getItem("authToken") ||
      "";
    if (t && t.trim()) {
      localStorage.setItem("token", t);
      localStorage.removeItem("auth_token");
      localStorage.removeItem("cg_token");
      localStorage.removeItem("authToken");
    }
  } catch {}

  const API_BASE =
    (window.__API_BASE__) ||
    (import.meta?.env?.VITE_API_BASE) ||
    (window.location.hostname.endsWith("onrender.com")
      ? "https://cyberguard-pro-cloud.onrender.com"
      : "http://localhost:8080");

  const orig = window.fetch;

  function getToken() {
    try {
      const t = localStorage.getItem("token") || "";
      return (t && t.trim()) || "";
    } catch { return ""; }
  }

  window.fetch = async function patchedFetch(input, init = {}) {
    try {
      const url =
        typeof input === "string"
          ? input
          : (input && input.url) || "";

      const isApi =
        url.startsWith(API_BASE) ||
        url.startsWith("/api") ||
        url.startsWith("https://cyberguard-pro-cloud.onrender.com");

      if (isApi) {
        const t = getToken();
init.headers = new Headers(init.headers || {});
  if (t && t.trim()) {
    if (!init.headers.has("Authorization")) {
      init.headers.set("Authorization", `Bearer ${t}`);
    }
  } else {
    init.headers.delete("Authorization");
  }
if (!init.credentials) {
    init.credentials = "include";
  }
}
        // Normalize headers to a Headers object (handles plain objects too)
        const hdrs = new Headers(init.headers || (typeof input !== "string" && input?.headers) || {});

        if (t) {
          if (!hdrs.has("Authorization")) {
            hdrs.set("Authorization", `Bearer ${t}`);
          }
        } else {
          // Ensure no blank Authorization header sneaks through
          if (hdrs.get("Authorization") === "Bearer" || !hdrs.get("Authorization")) {
            hdrs.delete("Authorization");
          }
        }

        // --- Super admin plan preview & bypass forwarding (client → API) ---
        // If the Admin UI stores preview/bypass flags in localStorage, attach
        // them as headers so the backend can honor them for super admins.
        try {
          const preview = (localStorage.getItem("admin_plan_preview") || "").toLowerCase();
          const bypass  = localStorage.getItem("admin_bypass_paywall");
          if (preview) {
            hdrs.set("x-admin-plan-preview", preview); // e.g. "pro_plus"
          }
          if (bypass === "1" || bypass === "true") {
            hdrs.set("x-admin-bypass", "1");
          }
        } catch {}

        init.headers = hdrs;
      }
    } catch {
      // fail open to avoid breaking fetch
    }
    return orig(input, init);
  };
})();
