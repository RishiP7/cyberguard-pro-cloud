const API_PREFIX = (import.meta?.env?.VITE_API_URL || '/api').replace(/\/+$/,'') + '/';

(function wrapFetch(){
  if (!('fetch' in window)) return;
  const orig = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const req = input instanceof Request ? input : null;
    const url = req ? req.url : String(input);
    const method = (req?.method || init.method || 'GET').toUpperCase();

    // only touch same-origin API calls (/api/… or the configured prefix)
    const isApi =
      url.startsWith('/api/') ||
      url.startsWith(API_PREFIX) ||
      (url.startsWith(location.origin) && url.includes('/api/'));

    if (!isApi) return orig(input, init);

    // HARD GUARD: admin-login must not be GET (prevents noisy 401 spam)
    if (url.includes('/auth/admin-login') && method !== 'POST') {
      console.warn('[fetchAuth] BLOCKED non-POST call to /auth/admin-login:', method, url);
      return new Response(JSON.stringify({ ok:false, error:'admin-login must be POST' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const headers = new Headers((req?.headers) || init.headers || {});
    const hadAuth = headers.has('Authorization') || headers.has('authorization');
    const token =
      localStorage.getItem('auth_token') ||
      localStorage.getItem('cg_token') ||
      '';

    if (token && !hadAuth) headers.set('Authorization', `Bearer ${token}`);
    if (!headers.has('Content-Type') && !(req && req.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    // Debug line: shows exactly what's sent
    const authPreview = headers.get('Authorization') ? (headers.get('Authorization').slice(0,24) + '…') : 'NONE';
    console.log('[fetchAuth]', method, url, 'auth=', authPreview);

    const doFetch = req
      ? () => orig(new Request(req, { headers }))
      : () => orig(input, { ...init, headers });

    const res = await doFetch();

    if (res.status === 401) {
      console.warn('[fetchAuth] 401 from', method, url, '- clearing token and redirecting to /login');
      try { localStorage.removeItem('auth_token'); localStorage.removeItem('cg_token'); } catch {}
      // Optional UX: kick to login
      if (!location.pathname.startsWith('/login')) {
        // best-effort keep intended destination
        const next = encodeURIComponent(location.pathname + location.search + location.hash);
        location.assign(`/login?next=${next}`);
      }
    }

    return res;
  };
})();
