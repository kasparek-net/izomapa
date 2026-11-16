/**
 * Lehký normalizovaný klient pro komunikaci doplňku s jeho backendem na zadané URL.
 *
 * Řeší jednotný JSON POST/GET požadavek, timeout a normalizovanou odpověď
 * `{ ok, status, data, error, message }`. Samotná serverová logika konkrétního
 * doplňku (autentizace, databáze, herní pravidla) patří přímo k danému doplňku.
 */
(() => {
  const Izomapa = window.Izomapa;
  if (!Izomapa || Izomapa.getLib('server_client')) return;

  function withTimeout(ms) {
    if (!(ms > 0) || typeof AbortController === 'undefined') return { signal: undefined, cancel: () => {} };
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      return { signal: AbortSignal.timeout(ms), cancel: () => {} };
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(new Error('Timeout')), ms);
    return { signal: ctrl.signal, cancel: () => clearTimeout(timer) };
  }

  async function request(url, action, payload = {}, options = {}) {
    const target = String(url || '').trim();
    if (!target) {
      return { ok: false, status: 0, data: null, error: 'missing_url', message: 'Chybí adresa serveru.' };
    }

    const method = String(options.method || 'POST').toUpperCase();
    const timeoutMs = options.timeoutMs ?? 8000;
    const headers = { Accept: 'application/json', ...(options.headers || {}) };
    const init = { method, headers };
    if (options.credentials) init.credentials = options.credentials;

    if (method !== 'GET' && method !== 'HEAD') {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
      const bodyObj = action ? { action, ...(payload || {}) } : (payload || {});
      init.body = JSON.stringify(bodyObj);
    }

    const { signal, cancel } = withTimeout(timeoutMs);
    if (signal && !options.signal) init.signal = signal;
    else if (options.signal) init.signal = options.signal;

    try {
      const resp = await fetch(target, init);
      const text = await resp.text();
      let data = null;
      if (text) {
        try { data = JSON.parse(text); } catch { data = null; }
      }
      const obj = data && typeof data === 'object' && !Array.isArray(data) ? data : null;
      const errCode = obj?.error ? String(obj.error) : null;
      const ok = resp.ok && !errCode && obj?.ok !== false;
      return {
        ok,
        status: resp.status,
        data,
        error: ok ? null : (errCode || (resp.ok ? 'request_failed' : `http_${resp.status}`)),
        message: obj?.message || (ok ? null : `Server vrátil chybu (${resp.status}).`),
      };
    } catch (err) {
      const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
      return {
        ok: false,
        status: 0,
        data: null,
        error: isTimeout ? 'timeout' : 'network_error',
        message: isTimeout ? 'Požadavek na server vypršel.' : 'Nepodařilo se spojit se serverem.',
      };
    } finally {
      cancel();
    }
  }

  function createClient(url, defaultOptions = {}) {
    const call = (action, payload = {}, options = {}) => request(url, action, payload, { ...defaultOptions, ...options });
    return { url: String(url || '').trim(), call, request: call };
  }

  Izomapa.registerLib('server_client', { request, createClient });
})();
