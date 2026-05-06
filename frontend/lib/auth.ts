export type StoredUser = {
  id?: number;
  email?: string;
  role?: "admin" | "directeur" | "employe" | string;
  employe_id?: number | null;
  employe?: {
    id?: number;
    nom?: string | null;
    prenom?: string | null;
    sexe?: string | null;
    groupe_id?: number | null;
  } | null;
};

function canUseLocalStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

export function getToken(): string | null {
  if (!canUseLocalStorage()) {
    return null;
  }

  try {
    return localStorage.getItem("token");
  } catch {
    return null;
  }
}

export function getStoredUser(): StoredUser | null {
  if (!canUseLocalStorage()) {
    return null;
  }

  try {
    const rawUser = localStorage.getItem("user");

    if (!rawUser) {
      return null;
    }

    const parsedUser = JSON.parse(rawUser) as unknown;

    if (!parsedUser || typeof parsedUser !== "object") {
      return null;
    }

    return parsedUser as StoredUser;
  } catch {
    return null;
  }
}

export function clearAuth() {
  if (!canUseLocalStorage()) {
    return;
  }

  try {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("keepSignedIn");
  } catch {
    // Ignore storage failures so logout actions never crash the UI.
  }
}

export function getDashboardPathByRole(role: unknown) {
  if (role === "admin") {
    return "/admin";
  }

  if (role === "directeur") {
    return "/directeur";
  }

  if (role === "employe") {
    return "/employe";
  }

  return "/";
}

export function isRole(user: StoredUser | null | undefined, role: string) {
  return user?.role === role;
}

export function isAuthenticated() {
  return Boolean(getToken());
}
