// Attach JWT automatically to API requests, but ONLY if we actually have a token.
const API_BASE = import.meta.env.VITE_API_URL || "";

(function patchFetch() {
  if (window.__CGP_FETCH_PATCHED__) return;
  window.__CGP_FETCH_PATCHED__ = true;

  const orig = window.fetch;

  function getToken() {
    const t =
      localStorage.getItem("auth_token") ||
      localStorage.getItem("cg_token") ||
      localStorage.getItem("authToken");
    return (t && t.trim()) || "";
  }

  window.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input?.url || "";
    const isApi =
      url.startsWith(API_BASE) ||
      url.startsWith("/api") ||
      url.startsWith("https://cyberguard-pro-cloud.onrender.com");

    if (isApi) {
      const t = getToken();
      if (t) {
        const headers = new Headers(init?.headers || {});
        if (!headers.has("Authorization")) {
          headers.set("Authorization", `Bearer ${t}`);
        }
        init = { ...init, headers };
      }
    }
    return orig(input, init);
  };
})();
