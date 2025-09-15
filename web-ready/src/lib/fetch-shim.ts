import './lib/fetch-shim';


// Only patch in production and only on https origins
if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
  const originalFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    let url = typeof input === 'string' ? input : String((input as any)?.url || input);

    // Rewrite any hardcoded localhost or direct backend calls to same-origin /api
    url = url
      .replace(/^http:\/\/localhost:8080\/api\b/i, '/api')
      .replace(/^http:\/\/localhost:8080\b/i, '/api')
      .replace(/^https?:\/\/[^/]*onrender\.com\/api\b/i, '/api')
      .replace(/^https?:\/\/[^/]*onrender\.com\b/i, '/api');

    // Ensure credentials for cookie-based auth
    const nextInit: RequestInit = {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
      ...init,
    };

    return originalFetch(url, nextInit);
  };
}