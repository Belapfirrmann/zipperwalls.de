// Gemeinsamer Fetch Helfer: wirft Fehler mit lesbarer Meldung der API
export async function apiFetch(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg = data?.error?.message || data?.message || data?.raw || `HTTP ${res.status}`;
    const err = new Error(String(msg).slice(0, 400));
    err.status = res.status;
    throw err;
  }
  return { data, headers: res.headers };
}
