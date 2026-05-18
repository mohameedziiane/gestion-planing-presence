"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import EmployeeNavbar from "@/components/EmployeeNavbar";
import { apiFetch } from "@/lib/api";
import {
  clearAuth,
  getDashboardPathByRole,
  getStoredUser,
  getToken,
  isRole,
  type StoredUser,
} from "@/lib/auth";

type ApiRow = Record<string, unknown> & {
  id?: number | string;
  employe_id?: number | string;
};

type AbsencesResponse = {
  absences?: ApiRow[];
};

function getString(row: ApiRow | null | undefined, keys: string[]) {
  if (!row) {
    return "";
  }

  for (const key of keys) {
    const value = row[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (typeof value === "number") {
      return String(value);
    }
  }

  return "";
}

function getPresenceStatus(row: ApiRow | undefined) {
  return getString(row, ["statut", "status"]) || "";
}

function getArrivalTime(row: ApiRow | undefined) {
  return getString(row, ["heure_arrivee", "arrival_time"]) || "";
}

async function fetchMyAbsences() {
  const payload = await apiFetch<AbsencesResponse>("/api/presence/me/absences");

  return Array.isArray(payload.absences) ? payload.absences : [];
}

function StatusBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex w-fit border border-[var(--color-badge-danger-border)] bg-[var(--color-badge-danger-bg)] px-2.5 py-1 text-xs font-semibold text-[var(--color-badge-danger-text)]">
      {children}
    </span>
  );
}

function LoadingPanel({ label }: { label: string }) {
  return (
    <section className="border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-5 text-sm font-semibold text-[var(--color-text-muted)]">
      {label}
    </section>
  );
}

export default function EmployeAbsencesPage() {
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [absences, setAbsences] = useState<ApiRow[]>([]);
  const [isAbsencesLoading, setIsAbsencesLoading] = useState(true);
  const [absencesError, setAbsencesError] = useState("");

  useEffect(() => {
    const token = getToken();
    const storedUser = getStoredUser();

    if (!token || !storedUser) {
      router.push("/");
      return;
    }

    if (isRole(storedUser, "admin") || isRole(storedUser, "directeur")) {
      router.push(getDashboardPathByRole(storedUser.role));
      return;
    }

    if (!isRole(storedUser, "employe")) {
      router.push("/");
      return;
    }

    Promise.resolve().then(() => {
      setUser(storedUser);
      setIsAuthorized(true);
    });
  }, [router]);

  useEffect(() => {
    if (!isAuthorized) {
      return;
    }

    let isActive = true;

    async function refreshAbsences() {
      setIsAbsencesLoading(true);
      setAbsencesError("");

      try {
        const rows = await fetchMyAbsences();

        if (isActive) {
          setAbsences(rows);
        }
      } catch (error) {
        if (isActive) {
          setAbsences([]);
          setAbsencesError(
            error instanceof Error
              ? error.message
              : "Impossible de charger vos absences."
          );
        }
      } finally {
        if (isActive) {
          setIsAbsencesLoading(false);
        }
      }
    }

    refreshAbsences();

    return () => {
      isActive = false;
    };
  }, [isAuthorized]);

  function handleLogout() {
    clearAuth();
    router.push("/");
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
      <EmployeeNavbar user={user} onLogout={handleLogout} />

      <section className="mx-auto w-full max-w-[1180px] px-4 py-8 sm:px-6 lg:py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-[var(--color-text)] sm:text-3xl">
            Mes absences
          </h1>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            Historique personnel des absences enregistrées.
          </p>
        </div>

        {isAbsencesLoading ? (
          <LoadingPanel label="Chargement des absences..." />
        ) : absencesError ? (
          <p className="border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-4 py-5 text-sm text-[var(--color-danger-text)]">
            {absencesError}
          </p>
        ) : absences.length === 0 ? (
          <p className="border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-5 text-sm text-[var(--color-text-muted)]">
            Aucune absence enregistrée.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {absences.map((absence, index) => (
              <article
                key={absence.id || `absence-${index}`}
                className="border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-[var(--color-text)]">
                      {getString(absence, ["date", "_date"]) || "-"}
                    </h3>
                    <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                      Aucun pointage enregistré
                    </p>
                  </div>
                  <StatusBadge>{getPresenceStatus(absence) || "Absent"}</StatusBadge>
                </div>
                <p className="text-sm text-[var(--color-text-muted)]">
                  Heure arrivée: {getArrivalTime(absence) || "-"}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
