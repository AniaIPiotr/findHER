const API_BASE = "http://localhost:8000";

async function rawFetch(path, options = {}) {
  return fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
}

// Automatyczne odświeżenie sesji przy 401 (raz).
export async function apiFetch(path, options = {}) {
  let res = await rawFetch(path, options);
  if (res.status === 401 && !path.startsWith("/auth/")) {
    const refresh = await rawFetch("/auth/refresh", { method: "POST" });
    if (refresh.ok) {
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
};

export const createUser = usersApi.create;
