// Attach JWT automatically to API requests, but **only** if we actually have a token.
const API_BASE = import.meta.env?.VITE_API_URL || "";

(function patchFetch() {
  if (window.__CGP_FETCH_PATCHED__) return;
  window.__CGP_FETCH_PATCHED__ = true;

  // keep original bound to window
  const orig = window.fetch.bind(window);

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
      (API_BASE && url.startsWith(API_BASE)) ||
      url.startsWith("/api") ||
      url.startsWith("https://cyberguard-pro-cloud.onrender.com");

    if (isApi) {
      const t = getToken();
      const headers = new Headers(init.headers || {});
      if (t) {
        // set Authorization only when non-empty and not already set
        if (!headers.has("Authorization")) {
          headers.set("Authorization", `Bearer ${t}`);
        }
      } else {
        // never send a blank Authorization header
        headers.delete("Authorization");
      }
      init.headers = headers;

      // opt-in: include cookies if your server needs them (CORS on server already allows credentials)
      if (init.credentials === undefined) init.credentials = "include";
    }

    return orig(input, init);
  };
})();
