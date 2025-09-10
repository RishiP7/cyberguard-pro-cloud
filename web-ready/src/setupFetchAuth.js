const API_PREFIX = (import.meta?.env?.VITE_API_URL || '/api').replace(/\/+$/,'') + '/';

(function wrapFetch(){
  if (!('fetch' in window)) return;
  const orig = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const req = input instanceof Request ? input : null;
    const url = req ? req.url : String(input);

    // only touch same-origin API calls
    const isApi =
      url.startsWith('/api/') ||
      url.startsWith(API_PREFIX) ||
      (url.startsWith(location.origin) && url.includes('/api/'));

    if (!isApi) return orig(input, init);

    const headers = new Headers((req?.headers) || init.headers || {});
    const hasAuth = headers.has('Authorization') || headers.has('authorization');
    const t =
      localStorage.getItem('auth_token') ||
      localStorage.getItem('cg_token') ||
      '';

    if (t && !hasAuth) headers.set('Authorization', `Bearer ${t}`);
    if (!headers.has('Content-Type') && !(req && req.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    if (req) {
      const newReq = new Request(req, { headers });
      return orig(newReq);
    } else {
      return orig(input, { ...init, headers });
    }
  };
})();
