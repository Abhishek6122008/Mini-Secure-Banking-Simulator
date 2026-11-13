// Calls the API. The token goes in the Authorization header (no cookies, so no CSRF to defend against). Errors carry
// the server's message and per-field validation messages, which are safe to show.
export async function api(path, { token, method = 'GET', body } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error ?? 'Something went wrong');
    error.status = res.status;
    error.fields = data.fields ?? {};
    throw error;
  }
  return data;
}
