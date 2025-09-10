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
  init.headers = new Headers(init.headers || {});
  // Only set Authorization if token is non-empty
  if (t && t.trim()) {
    if (!init.headers.has("Authorization")) {
      init.headers.set("Authorization", `Bearer ${t}`);
    }
  } else {
    // Explicitly remove any accidental Authorization header
    init.headers.delete("Authorization");
  }
}
    return orig(input, init);
  };
})();
