/**
 * Global fetch wrapper:
 * - Adds Authorization: Bearer <token> when present
 * - Sends cookies (for refresh cookie auth) via credentials: 'include'
 * - Propagates admin plan preview header from localStorage (for superadmin)
 */
(() => {
  const API_BASE = (typeof import !== "undefined" && import.meta && import.meta.env && import.meta.env.VITE_API_URL) || "/api";

  const orig = window.fetch;

  function getToken() {
    try {
      return (
        localStorage.getItem("token") ||
        localStorage.getItem("auth_token") ||
        localStorage.getItem("cg_token") ||
        localStorage.getItem("authToken") ||
        ""
      );
    } catch {
      return "";
    }
  }

  window.fetch = async (input, init = {}) => {
    try {
      const url = typeof input === "string" ? input : (input && input.url) || "";
      const isApi =
        url.startsWith(API_BASE) ||
        url.startsWith("/api") ||
        url.startsWith("https://cyberguard-pro-cloud.onrender.com");

      if (isApi) {
        // Normalize headers
        const hdrs = new Headers(init.headers || (typeof input !== "string" && input && input.headers) || {});
        const t = getToken();

        if (t && t.trim()) {
          if (!hdrs.has("Authorization")) {
            hdrs.set("Authorization", `Bearer ${t}`);
          }
        } else {
          // make sure we don't send a blank Authorization header
          if (!hdrs.get("Authorization") || hdrs.get("Authorization") === "Bearer") {
            hdrs.delete("Authorization");
          }
        }

        // Always include cookies so refresh cookie auth works
        if (!init.credentials) {
          init.credentials = "include";
        }

        // Optional superadmin plan preview header
        const preview =
          localStorage.getItem("admin_plan_preview") ||
          localStorage.getItem("adminPlanPreview");
        if (preview && !hdrs.has("x-admin-plan-preview")) {
          hdrs.set("x-admin-plan-preview", preview);
        }

        init.headers = hdrs;
      }
    } catch {
      // fail open to avoid breaking fetch
    }

    return orig(input, init);
  };
})();
