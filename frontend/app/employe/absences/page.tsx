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
    <span className="inline-flex w-fit border border-red-300/25 bg-red-400/10 px-2.5 py-1 text-xs font-semibold text-red-100">
      {children}
    </span>
  );
}

function LoadingPanel({ label }: { label: string }) {
  return (
    <section className="border border-[rgba(172,189,197,0.15)] bg-[#38474e] px-4 py-5 text-sm font-semibold text-[#acbdc5]">
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
      <main className="flex min-h-screen items-center justify-center bg-[#4c595f] px-6 text-[#e1e3e4]">
        <p className="text-sm font-semibold text-[#acbdc5]">Chargement...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#4c595f] text-[#e1e3e4]">
      <EmployeeNavbar user={user} onLogout={handleLogout} />

      <section className="mx-auto w-full max-w-[1180px] px-4 py-8 sm:px-6 lg:py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-[#e1e3e4] sm:text-3xl">
            Mes absences
          </h1>
          <p className="mt-2 text-sm text-[#acbdc5]">
            Historique personnel des absences enregistrées.
          </p>
        </div>

        {isAbsencesLoading ? (
          <LoadingPanel label="Chargement des absences..." />
        ) : absencesError ? (
          <p className="border border-red-300/30 bg-red-500/10 px-4 py-5 text-sm text-red-100">
            {absencesError}
          </p>
        ) : absences.length === 0 ? (
          <p className="border border-[rgba(172,189,197,0.15)] bg-[#38474e] px-4 py-5 text-sm text-[#acbdc5]">
            Aucune absence enregistrée.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {absences.map((absence, index) => (
              <article
                key={absence.id || `absence-${index}`}
                className="border border-[rgba(172,189,197,0.15)] bg-[#38474e] p-4"
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-[#e1e3e4]">
                      {getString(absence, ["date", "_date"]) || "-"}
                    </h3>
                    <p className="mt-1 text-sm text-[#acbdc5]">
                      Aucun pointage enregistré
                    </p>
                  </div>
                  <StatusBadge>{getPresenceStatus(absence) || "Absent"}</StatusBadge>
                </div>
                <p className="text-sm text-[#acbdc5]">
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
