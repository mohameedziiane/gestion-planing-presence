"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";

import AdminNavbar from "@/components/AdminNavbar";
import DirecteurNavbar from "@/components/DirecteurNavbar";
import EmployeeNavbar from "@/components/EmployeeNavbar";
import { ApiError, API_BASE_URL, apiFetch } from "@/lib/api";
import {
  clearAuth,
  getDashboardPathByRole,
  getStoredUser,
  getToken,
  getUserAvatarUrl,
  isRole,
  setStoredUser,
  type StoredUser,
} from "@/lib/auth";

const MAX_AVATAR_SIZE_BYTES = 1024 * 1024;
const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png"];

type ProfileRole = "admin" | "employe" | "directeur";

type ProfilePageContentProps = {
  role: ProfileRole;
  fallbackDisplayName: string;
};

function getDisplayName(user: StoredUser | null, fallbackDisplayName: string) {
  if (user?.employe?.prenom || user?.employe?.nom) {
    return [user.employe?.prenom, user.employe?.nom].filter(Boolean).join(" ");
  }

  if (user?.email) {
    return user.email;
  }

  return fallbackDisplayName;
}

function getAvatarLetter(displayName: string) {
  return displayName.trim().charAt(0).toUpperCase() || "U";
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Impossible de lire le fichier sélectionné."));
    };

    reader.onerror = () => {
      reject(new Error("Impossible de lire le fichier sélectionné."));
    };

    reader.readAsDataURL(file);
  });
}

function resolveAvatarSrc(avatarUrl: string) {
  if (!avatarUrl) {
    return "";
  }

  if (/^https?:\/\//i.test(avatarUrl) || avatarUrl.startsWith("blob:")) {
    return avatarUrl;
  }

  return `${API_BASE_URL}${avatarUrl.startsWith("/") ? avatarUrl : `/${avatarUrl}`}`;
}

function getAvatarFileError(file: File) {
  if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
    return "Le fichier doit être au format JPEG ou PNG.";
  }

  if (file.size > MAX_AVATAR_SIZE_BYTES) {
    return "L'avatar doit faire 1 Mo maximum.";
  }

  return "";
}

function Feedback({
  tone,
  message,
}: {
  tone: "success" | "error";
  message: string;
}) {
  const classes =
    tone === "success"
      ? "border-[var(--color-success-border)] bg-[var(--color-success-bg)] text-[var(--color-success-text)]"
      : "border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger-text)]";

  return <p className={`border px-4 py-3 text-sm ${classes}`}>{message}</p>;
}

export default function ProfilePageContent({
  role,
  fallbackDisplayName,
}: ProfilePageContentProps) {
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const displayName = useMemo(
    () => getDisplayName(user, fallbackDisplayName),
    [fallbackDisplayName, user]
  );
  const avatarLetter = useMemo(() => getAvatarLetter(displayName), [displayName]);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [avatarMessage, setAvatarMessage] = useState("");
  const [avatarError, setAvatarError] = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState("");
  const [avatarObjectUrl, setAvatarObjectUrl] = useState("");
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [isSavingAvatar, setIsSavingAvatar] = useState(false);
  const [isLoadingAvatar, setIsLoadingAvatar] = useState(true);

  function handleLogout() {
    clearAuth();
    router.push("/");
  }

  useEffect(() => {
    const token = getToken();
    const storedUser = getStoredUser();

    if (!token || !storedUser) {
      router.push("/");
      return;
    }

    if (!isRole(storedUser, role)) {
      router.push(getDashboardPathByRole(storedUser.role));
      return;
    }

    setUser(storedUser);
    setIsAuthorized(true);
  }, [role, router]);

  useEffect(() => {
    if (!isAuthorized) {
      return;
    }

    const token = getToken();

    if (!token) {
      router.push("/");
      return;
    }

    let isActive = true;

    async function loadAvatar() {
      setIsLoadingAvatar(true);
      setAvatarError("");

      try {
        const response = await fetch(`${API_BASE_URL}/api/auth/avatar`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        });

        if (!isActive) {
          return;
        }

        if (response.status === 404) {
          setAvatarPreviewUrl("");
          return;
        }

        if (!response.ok) {
          const payload = await response.text();
          throw new Error(payload || "Impossible de charger l'avatar.");
        }

        const blob = await response.blob();
        const objectUrl = window.URL.createObjectURL(blob);

        setAvatarObjectUrl((currentUrl) => {
          if (currentUrl) {
            window.URL.revokeObjectURL(currentUrl);
          }

          return objectUrl;
        });
        setAvatarPreviewUrl(objectUrl);
      } catch (error) {
        if (isActive) {
          setAvatarPreviewUrl("");
          setAvatarError(
            error instanceof Error
              ? error.message
              : "Impossible de charger l'avatar."
          );
        }
      } finally {
        if (isActive) {
          setIsLoadingAvatar(false);
        }
      }
    }

    loadAvatar();

    return () => {
      isActive = false;
    };
  }, [isAuthorized, router]);

  useEffect(() => {
    return () => {
      if (avatarObjectUrl) {
        window.URL.revokeObjectURL(avatarObjectUrl);
      }
    };
  }, [avatarObjectUrl]);

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordMessage("");
    setPasswordError("");

    if (newPassword !== confirmNewPassword) {
      setPasswordError("La confirmation du nouveau mot de passe ne correspond pas.");
      return;
    }

    setIsSavingPassword(true);

    try {
      const result = await apiFetch<{ message?: string }>("/api/auth/change-password", {
        method: "PATCH",
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmNewPassword,
        }),
      });

      setPasswordMessage(result.message || "Mot de passe mis à jour avec succès.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch (error) {
      setPasswordError(
        error instanceof ApiError || error instanceof Error
          ? error.message
          : "Impossible de mettre à jour le mot de passe."
      );
    } finally {
      setIsSavingPassword(false);
    }
  }

  async function handleAvatarSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAvatarMessage("");
    setAvatarError("");

    if (!selectedAvatar) {
      setAvatarError("Sélectionnez un fichier JPEG ou PNG.");
      return;
    }

    const fileError = getAvatarFileError(selectedAvatar);

    if (fileError) {
      setAvatarError(fileError);
      return;
    }

    setIsSavingAvatar(true);

    try {
      const avatarDataUrl = await readFileAsDataUrl(selectedAvatar);
      const result = await apiFetch<{
        message?: string;
        avatarUrl?: string;
        avatar_url?: string;
        user?: StoredUser;
      }>("/api/auth/avatar", {
        method: "PATCH",
        body: JSON.stringify({
          avatarDataUrl,
        }),
      });
      const currentUser = getStoredUser() || {};
      const updatedUser = result.user || {
        ...currentUser,
        avatar_url: result.avatar_url || result.avatarUrl || "",
        avatarUrl: result.avatarUrl || result.avatar_url || "",
      };
      const savedAvatarUrl = getUserAvatarUrl(updatedUser);

      setAvatarMessage(result.message || "Avatar mis à jour avec succès.");
      setStoredUser(updatedUser);
      setUser(updatedUser);
      setAvatarPreviewUrl(resolveAvatarSrc(savedAvatarUrl));
      setAvatarObjectUrl((currentUrl) => {
        if (currentUrl) {
          window.URL.revokeObjectURL(currentUrl);
        }

        return "";
      });
      setSelectedAvatar(null);
    } catch (error) {
      setAvatarError(
        error instanceof ApiError || error instanceof Error
          ? error.message
          : "Impossible de mettre à jour l'avatar."
      );
    } finally {
      setIsSavingAvatar(false);
    }
  }

  function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;
    setAvatarMessage("");
    setAvatarError("");

    if (!file) {
      setSelectedAvatar(null);
      return;
    }

    const fileError = getAvatarFileError(file);

    if (fileError) {
      setSelectedAvatar(null);
      event.target.value = "";
      setAvatarError(fileError);
      return;
    }

    const localPreviewUrl = window.URL.createObjectURL(file);

    setAvatarObjectUrl((currentUrl) => {
      if (currentUrl) {
        window.URL.revokeObjectURL(currentUrl);
      }

      return localPreviewUrl;
    });
    setAvatarPreviewUrl(localPreviewUrl);
    setSelectedAvatar(file);
  }

  function renderNavbar() {
    if (role === "admin") {
      return <AdminNavbar onLogout={handleLogout} />;
    }

    if (role === "directeur") {
      return <DirecteurNavbar user={user} onLogout={handleLogout} />;
    }

    return <EmployeeNavbar user={user} onLogout={handleLogout} />;
  }

  if (!isAuthorized) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-6 text-[var(--color-text)]">
        <p className="text-sm font-semibold text-[var(--color-text-muted)]">Chargement...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[var(--color-bg)] text-[var(--color-text)]">
      {renderNavbar()}

      <section className="mx-auto w-full max-w-[980px] px-4 py-8 sm:px-6 lg:py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-[var(--color-text)] sm:text-3xl">
            Profil
          </h1>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            Gérez votre mot de passe et votre avatar.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-[var(--color-text)]">
                Changer le mot de passe
              </h2>
            </div>

            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              {passwordMessage ? <Feedback tone="success" message={passwordMessage} /> : null}
              {passwordError ? <Feedback tone="error" message={passwordError} /> : null}

              <label className="block text-sm font-semibold text-[var(--color-text-muted)]">
                <span className="mb-2 block">Mot de passe actuel</span>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  className="h-11 w-full rounded border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20"
                  required
                />
              </label>

              <label className="block text-sm font-semibold text-[var(--color-text-muted)]">
                <span className="mb-2 block">Nouveau mot de passe</span>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  className="h-11 w-full rounded border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20"
                  minLength={8}
                  required
                />
              </label>

              <label className="block text-sm font-semibold text-[var(--color-text-muted)]">
                <span className="mb-2 block">Confirmation du nouveau mot de passe</span>
                <input
                  type="password"
                  value={confirmNewPassword}
                  onChange={(event) => setConfirmNewPassword(event.target.value)}
                  className="h-11 w-full rounded border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20"
                  minLength={8}
                  required
                />
              </label>

              <button
                type="submit"
                disabled={isSavingPassword}
                className="h-11 rounded bg-[var(--color-accent)] px-5 text-sm font-bold text-white transition hover:bg-[var(--color-accent-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/35 focus:ring-offset-2 focus:ring-offset-[var(--color-surface)] disabled:cursor-not-allowed disabled:bg-[var(--color-accent-hover)] disabled:opacity-70"
              >
                {isSavingPassword ? "Sauvegarde..." : "Sauvegarder"}
              </button>
            </form>
          </section>

          <section className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-[var(--color-text)]">Avatar</h2>
            </div>

            <form onSubmit={handleAvatarSubmit} className="space-y-4">
              {avatarMessage ? <Feedback tone="success" message={avatarMessage} /> : null}
              {avatarError ? <Feedback tone="error" message={avatarError} /> : null}

              <div className="flex items-center gap-4">
                <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)]">
                  {avatarPreviewUrl ? (
                    <Image
                      src={avatarPreviewUrl}
                      alt="Avatar actuel"
                      width={96}
                      height={96}
                      unoptimized
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-2xl font-bold text-[var(--color-text-muted)]">
                      {avatarLetter}
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--color-text)]">
                    Avatar actuel
                  </p>
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                    {isLoadingAvatar
                      ? "Chargement..."
                      : "JPEG ou PNG, 1 Mo maximum."}
                  </p>
                </div>
              </div>

              <label className="block text-sm font-semibold text-[var(--color-text-muted)]">
                <span className="mb-2 block">Fichier avatar</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  onChange={handleAvatarChange}
                  className="block w-full text-sm text-[var(--color-text-muted)] file:mr-4 file:rounded file:border file:border-[var(--color-border)] file:bg-[var(--color-surface-muted)] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[var(--color-text)]"
                />
              </label>

              <button
                type="submit"
                disabled={isSavingAvatar}
                className="h-11 rounded bg-[var(--color-accent)] px-5 text-sm font-bold text-white transition hover:bg-[var(--color-accent-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/35 focus:ring-offset-2 focus:ring-offset-[var(--color-surface)] disabled:cursor-not-allowed disabled:bg-[var(--color-accent-hover)] disabled:opacity-70"
              >
                {isSavingAvatar ? "Sauvegarde..." : "Sauvegarder"}
              </button>
            </form>
          </section>
        </div>
      </section>
    </main>
  );
}
