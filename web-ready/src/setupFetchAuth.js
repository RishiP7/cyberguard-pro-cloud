/**
 * Global fetch wrapper:
 * - Adds Authorization: Bearer <token> when present
 * - Sends cookies with API calls (credentials: 'include') for cookie auth
 * - Propagates admin plan preview header from localStorage
 */
(() => {
  let API_BASE = "/api";
  try {
    if (import.meta && import.meta.env && import.meta.env.VITE_API_URL) {
      API_BASE = import.meta.env.VITE_API_URL;
    }
  } catch (_) {
    // not a module context; keep default
  }

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
        const hdrs = new Headers(
          init.headers || (typeof input !== "string" && input && input.headers) || {}
        );

        const t = getToken();
        if (t && t.trim()) {
          if (!hdrs.has("Authorization")) {
            hdrs.set("Authorization", `Bearer ${t}`);
          }
        } else {
          if (!hdrs.get("Authorization") || hdrs.get("Authorization") === "Bearer") {
            hdrs.delete("Authorization");
          }
        }

        if (!init.credentials) {
          init.credentials = "include";
        }

        const preview =
          localStorage.getItem("admin_plan_preview") ||
          localStorage.getItem("adminPlanPreview");
        if (preview && !hdrs.has("x-admin-plan-preview")) {
          hdrs.set("x-admin-plan-preview", preview);
        }

        init.headers = hdrs;
      }
    } catch {
      // fail open
    }

    return orig(input, init);
  };
})();
