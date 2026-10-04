// api.js
const API_BASE =
  (import.meta.env && import.meta.env.VITE_API_URL) || "http://localhost:8000";

async function rawFetch(path, options = {}) {
  return fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
}

// Single-flight refresh: równoległe 401 NIE mogą odpalać wielu refreshy
// (inaczej backend wykrywa reuse i unieważnia całą sesję).
let refreshPromise = null;

async function ensureRefresh() {
  if (!refreshPromise) {
    refreshPromise = rawFetch("/auth/refresh", { method: "POST" })
      .catch(() => null)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export async function apiFetch(path, options = {}) {
  let res = await rawFetch(path, options);
  if (res.status === 401 && !path.startsWith("/auth/")) {
    const refresh = await ensureRefresh();
    if (refresh && refresh.ok) {
      res = await rawFetch(path, options);
    }
  }
  return res;
}

export const authApi = {
  me: () => apiFetch("/auth/me"),
  logout: () => apiFetch("/auth/logout", { method: "POST" }),
  google: (credential) =>
    apiFetch("/auth/google", {
      method: "POST",
      body: JSON.stringify({ credential }),
    }),
};

export const usersApi = {
  create: (payload) =>
    apiFetch("/add-User", { method: "POST", body: JSON.stringify(payload) }),
  list: () => apiFetch("/Users"),
  get: (id) => apiFetch(`/Users/${id}`),
};

export const groupsApi = {
  list: () => apiFetch("/groups"),
  create: (payload) =>
    apiFetch("/groups", { method: "POST", body: JSON.stringify(payload) }),
  get: (id) => apiFetch(`/groups/${id}`),
  invite: (id, email) =>
    apiFetch(`/groups/${id}/invite`, {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  accept: (id) => apiFetch(`/groups/${id}/accept`, { method: "POST" }),
  leave: (id) => apiFetch(`/groups/${id}/leave`, { method: "DELETE" }),
  remove: (id) => apiFetch(`/groups/${id}`, { method: "DELETE" }),
};

export const createUser = usersApi.create;
