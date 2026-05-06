"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ApiError, apiFetch } from "@/lib/api";
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

type TodayState = {
  planning: ApiRow[];
  repos: ApiRow[];
  presence: ApiRow[];
};

type DayStatus = {
  date: string;
  planning: ApiRow[];
  repos: ApiRow[];
  presence: ApiRow[];
};

type AbsencesResponse = {
  absences?: ApiRow[];
};

type WeekMode = "current" | "next";

const dayLabels = [
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
  "Dimanche",
];

function formatDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getTodayDateValue() {
  return formatDateValue(new Date());
}

function parseLocalDate(dateValue: string) {
  return new Date(`${dateValue}T00:00:00`);
}

function addDays(dateValue: string, offset: number) {
  const date = parseLocalDate(dateValue);
  date.setDate(date.getDate() + offset);

  return formatDateValue(date);
}

function getCurrentWeekMonday() {
  const date = new Date();
  const day = date.getDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;

  date.setDate(date.getDate() - daysSinceMonday);

  return formatDateValue(date);
}

function getWeekDates(mode: WeekMode) {
  const startDate =
    mode === "current"
      ? getCurrentWeekMonday()
      : addDays(getCurrentWeekMonday(), 7);

  return Array.from({ length: 7 }, (_, index) => addDays(startDate, index));
}

function normalizeText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

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

function getEmployeeName(user: StoredUser | null) {
  const firstName = user?.employe?.prenom?.trim() || "";
  const lastName = user?.employe?.nom?.trim() || "";
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();

  return fullName || user?.email || "Employe";
}

function getShiftName(row: ApiRow) {
  return (
    getString(row, [
      "periode_travail",
      "periode_nom",
      "periode",
      "periode_name",
      "periodeTravail",
    ]) || "Non defini"
  );
}

function getRoleName(row: ApiRow) {
  return (
    getString(row, [
      "role_travail",
      "role_travail_nom",
      "role",
      "role_name",
      "roleTravail",
    ]) || "Role non defini"
  );
}

function getPresenceStatus(row: ApiRow | undefined) {
  return getString(row, ["statut", "status"]) || "";
}

function getArrivalTime(row: ApiRow | undefined) {
  return getString(row, ["heure_arrivee", "arrival_time"]) || "";
}

function getReposType(row: ApiRow | undefined) {
  return getString(row, ["type", "repos_type", "type_repos"]) || "Repos";
}

function getRows(payload: unknown) {
  return Array.isArray(payload) ? (payload as ApiRow[]) : [];
}

async function fetchDayStatus(date: string): Promise<DayStatus> {
  const [planning, repos, presence] = await Promise.all([
    apiFetch(`/api/planning/date/${date}`).then(getRows),
    apiFetch(`/api/repos/date/${date}`).then(getRows),
    apiFetch(`/api/presence/date/${date}`).then(getRows),
  ]);

  return {
    date,
    planning,
    repos,
    presence,
  };
}

async function fetchMyAbsences() {
  const payload = await apiFetch<AbsencesResponse>("/api/presence/me/absences");

  return Array.isArray(payload.absences) ? payload.absences : [];
}

function StatusBadge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "blue" | "green" | "yellow" | "red" | "muted";
}) {
  const classes = {
    blue: "border-[#1AB6FF]/25 bg-[#1AB6FF]/10 text-[#bdeaff]",
    green: "border-emerald-300/25 bg-emerald-400/10 text-emerald-100",
    yellow: "border-yellow-300/25 bg-yellow-400/10 text-yellow-100",
    red: "border-red-300/25 bg-red-400/10 text-red-100",
    muted: "border-[rgba(172,189,197,0.15)] bg-[#334149] text-[#acbdc5]",
  };

  return (
    <span className={`inline-flex w-fit border px-2.5 py-1 text-xs font-semibold ${classes[tone]}`}>
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

function DayCard({ day, index }: { day: DayStatus; index: number }) {
  const reposRow = day.repos[0];
  const presenceRow = day.presence[0];
  const presenceStatus = normalizeText(getPresenceStatus(presenceRow));
  const hasPresentRecord = presenceStatus === normalizeText("Present");
  const isRepos = day.repos.length > 0;
  const hasPlanning = day.planning.length > 0;

  return (
    <article className="border border-[rgba(172,189,197,0.15)] bg-[#38474e] p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-[#e1e3e4]">
            {dayLabels[index]}
          </h3>
          <p className="mt-1 text-sm text-[#acbdc5]">{day.date}</p>
        </div>
        {hasPresentRecord ? (
          <StatusBadge tone="green">Present</StatusBadge>
        ) : isRepos ? (
          <StatusBadge tone="muted">Repos</StatusBadge>
        ) : hasPlanning ? (
          <StatusBadge tone="yellow">Non pointe</StatusBadge>
        ) : (
          <StatusBadge tone="red">No planning</StatusBadge>
        )}
      </div>

      {isRepos ? (
        <div>
          <p className="text-sm font-semibold text-[#e1e3e4]">Repos</p>
          <p className="mt-1 text-sm text-[#acbdc5]">Type: {getReposType(reposRow)}</p>
        </div>
      ) : hasPlanning ? (
        <div className="space-y-3">
          {day.planning.map((row, rowIndex) => (
            <div
              key={row.id || `${day.date}-${rowIndex}`}
              className="border-l-2 border-[#1AB6FF] bg-[#334149] px-3 py-3"
            >
              <p className="text-sm font-semibold text-[#e1e3e4]">
                Travail: {getShiftName(row)}
              </p>
              <p className="mt-1 text-sm text-[#acbdc5]">{getRoleName(row)}</p>
            </div>
          ))}
          {hasPresentRecord ? (
            <p className="text-sm text-emerald-100">
              Pointe a {getArrivalTime(presenceRow)}
            </p>
          ) : (
            <p className="text-sm text-[#acbdc5]">Presence non pointee.</p>
          )}
        </div>
      ) : (
        <p className="text-sm text-[#acbdc5]">Aucun planning pour cette date.</p>
      )}
    </article>
  );
}

export default function EmployePage() {
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [todayState, setTodayState] = useState<TodayState>({
    planning: [],
    repos: [],
    presence: [],
  });
  const [weekMode, setWeekMode] = useState<WeekMode>("current");
  const [weekRows, setWeekRows] = useState<DayStatus[]>([]);
  const [isTodayLoading, setIsTodayLoading] = useState(true);
  const [isWeekLoading, setIsWeekLoading] = useState(true);
  const [isPointing, setIsPointing] = useState(false);
  const [todayError, setTodayError] = useState("");
  const [weekError, setWeekError] = useState("");
  const [pointageMessage, setPointageMessage] = useState("");
  const [absences, setAbsences] = useState<ApiRow[]>([]);
  const [isAbsencesLoading, setIsAbsencesLoading] = useState(true);
  const [absencesError, setAbsencesError] = useState("");

  const todayDate = useMemo(() => getTodayDateValue(), []);
  const todayReposRow = todayState.repos[0];
  const todayPresenceRow = todayState.presence[0];
  const todayPresenceStatus = normalizeText(getPresenceStatus(todayPresenceRow));
  const alreadyPointed = todayPresenceStatus === normalizeText("Present");
  const hasTodayPlanning = todayState.planning.length > 0;
  const hasTodayRepos = todayState.repos.length > 0;
  const canPoint =
    isAuthorized &&
    !isTodayLoading &&
    !isPointing &&
    hasTodayPlanning &&
    !hasTodayRepos &&
    !alreadyPointed;

  useEffect(() => {
    const token = getToken();
    const storedUser = getStoredUser();

    if (!token || !storedUser) {
      router.push("/");
      return;
    }

    if (isRole(storedUser, "admin")) {
      router.push(getDashboardPathByRole(storedUser.role));
      return;
    }

    if (isRole(storedUser, "directeur")) {
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

  const refreshTodayState = useCallback(async () => {
    setIsTodayLoading(true);
    setTodayError("");

    try {
      const dayStatus = await fetchDayStatus(todayDate);

      setTodayState({
        planning: dayStatus.planning,
        repos: dayStatus.repos,
        presence: dayStatus.presence,
      });
    } catch (error) {
      setTodayState({ planning: [], repos: [], presence: [] });
      setTodayError(
        error instanceof Error
          ? error.message
          : "Impossible de charger le pointage du jour."
      );
    } finally {
      setIsTodayLoading(false);
    }
  }, [todayDate]);

  useEffect(() => {
    if (!isAuthorized) {
      return;
    }

    Promise.resolve().then(() => {
      void refreshTodayState();
    });
  }, [isAuthorized, refreshTodayState]);

  useEffect(() => {
    if (!isAuthorized) {
      return;
    }

    let isActive = true;

    async function refreshWeekState() {
      setIsWeekLoading(true);
      setWeekError("");

      try {
        const days = await Promise.all(
          getWeekDates(weekMode).map((date) => fetchDayStatus(date))
        );

        if (isActive) {
          setWeekRows(days);
        }
      } catch (error) {
        if (isActive) {
          setWeekRows([]);
          setWeekError(
            error instanceof Error
              ? error.message
              : "Impossible de charger le planning."
          );
        }
      } finally {
        if (isActive) {
          setIsWeekLoading(false);
        }
      }
    }

    refreshWeekState();

    return () => {
      isActive = false;
    };
  }, [isAuthorized, weekMode]);

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

  async function handlePointage() {
    setIsPointing(true);
    setPointageMessage("");

    try {
      const result = await apiFetch<{ message?: string }>("/api/presence/pointer", {
        method: "POST",
      });

      setPointageMessage(result.message || "Presence pointee avec succes.");
      await refreshTodayState();
    } catch (error) {
      setPointageMessage(
        error instanceof ApiError || error instanceof Error
          ? error.message
          : "Impossible de pointer la presence."
      );
    } finally {
      setIsPointing(false);
    }
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
      <header className="border-b border-[rgba(172,189,197,0.15)] bg-[#38474e]">
        <nav className="mx-auto flex min-h-[78px] w-full max-w-[1180px] flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Image
              src="/logo.webp"
              alt="Gare Routiere de Taza"
              width={48}
              height={48}
              priority
              className="h-12 w-12 object-contain"
            />
            <div>
              <p className="text-sm font-semibold text-[#e1e3e4]">
                Espace employe
              </p>
              <p className="text-xs text-[#acbdc5]">Gare Routiere de Taza</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-[#e1e3e4]">
              {getEmployeeName(user)}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="border border-[rgba(172,189,197,0.18)] px-4 py-2 text-sm font-semibold text-[#acbdc5] transition hover:border-[#1AB6FF] hover:text-[#e1e3e4]"
            >
              Logout
            </button>
          </div>
        </nav>
      </header>

      <section className="mx-auto w-full max-w-[1180px] px-4 py-8 sm:px-6 lg:py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-[#e1e3e4] sm:text-3xl">
            Tableau de bord employe
          </h1>
          <p className="mt-2 text-sm text-[#acbdc5]">
            Pointage et planning limite a cette semaine et la semaine prochaine.
          </p>
        </div>

        <section className="mb-8 border border-l-4 border-[rgba(172,189,197,0.15)] border-l-[#1AB6FF] bg-[#38474e] p-4 sm:p-5">
          <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div>
              <h2 className="text-xl font-semibold text-[#e1e3e4]">
                Pointage du jour
              </h2>
              <p className="mt-1 text-sm text-[#acbdc5]">
                {getEmployeeName(user)} - {todayDate}
              </p>
            </div>
            {alreadyPointed ? (
              <StatusBadge tone="green">Deja pointe</StatusBadge>
            ) : hasTodayRepos ? (
              <StatusBadge tone="muted">Repos</StatusBadge>
            ) : hasTodayPlanning ? (
              <StatusBadge tone="blue">Travail</StatusBadge>
            ) : (
              <StatusBadge tone="red">No planning</StatusBadge>
            )}
          </div>

          {isTodayLoading ? (
            <p className="border border-[rgba(172,189,197,0.15)] bg-[#334149] px-3 py-4 text-sm text-[#acbdc5]">
              Chargement du pointage...
            </p>
          ) : todayError ? (
            <p className="border border-red-300/30 bg-red-500/10 px-3 py-4 text-sm text-red-100">
              {todayError}
            </p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
              <div className="border border-[rgba(172,189,197,0.15)] bg-[#334149] p-4">
                {alreadyPointed ? (
                  <>
                    <p className="text-sm font-semibold text-[#e1e3e4]">
                      Presence deja enregistree
                    </p>
                    <p className="mt-2 text-sm text-[#acbdc5]">
                      Heure d&apos;arrivee: {getArrivalTime(todayPresenceRow)}
                    </p>
                  </>
                ) : hasTodayRepos ? (
                  <>
                    <p className="text-sm font-semibold text-[#e1e3e4]">
                      Repos aujourd&apos;hui
                    </p>
                    <p className="mt-2 text-sm text-[#acbdc5]">
                      Type: {getReposType(todayReposRow)}
                    </p>
                  </>
                ) : hasTodayPlanning ? (
                  <div className="space-y-3">
                    <p className="text-sm font-semibold text-[#e1e3e4]">
                      Travail aujourd&apos;hui
                    </p>
                    {todayState.planning.map((row, index) => (
                      <div
                        key={row.id || `today-${index}`}
                        className="border-l-2 border-[#1AB6FF] bg-[#38474e] px-3 py-3"
                      >
                        <p className="text-sm font-semibold text-[#e1e3e4]">
                          {getShiftName(row)}
                        </p>
                        <p className="mt-1 text-sm text-[#acbdc5]">
                          {getRoleName(row)}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-[#e1e3e4]">
                      Aucun planning aujourd&apos;hui
                    </p>
                    <p className="mt-2 text-sm text-[#acbdc5]">
                      Le pointage est indisponible sans planning du jour.
                    </p>
                  </>
                )}
              </div>

              <aside className="flex flex-col justify-between gap-4 border border-[rgba(172,189,197,0.15)] bg-[#334149] p-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#acbdc5]">
                    Action
                  </p>
                  <p className="mt-2 text-sm text-[#acbdc5]">
                    Le pointage est valide par le serveur et limite au reseau interne.
                  </p>
                </div>

                {canPoint ? (
                  <button
                    type="button"
                    onClick={handlePointage}
                    disabled={isPointing}
                    className="h-11 bg-[#1AB6FF] px-5 text-sm font-bold text-white transition hover:bg-[#169CDC] focus:outline-none focus:ring-2 focus:ring-[#1AB6FF]/35 disabled:cursor-not-allowed disabled:bg-[#169CDC] disabled:opacity-70"
                  >
                    {isPointing ? "Pointage..." : "Pointer ma pr\u00e9sence"}
                  </button>
                ) : (
                  <p className="border border-[rgba(172,189,197,0.15)] bg-[#38474e] px-3 py-3 text-sm text-[#acbdc5]">
                    {alreadyPointed
                      ? "Vous avez deja pointe aujourd'hui."
                      : hasTodayRepos
                        ? "Pointage indisponible pendant un repos."
                        : hasTodayPlanning
                          ? "Pointage momentanement indisponible."
                          : "Pointage indisponible sans planning."}
                  </p>
                )}

                {pointageMessage ? (
                  <p className="border border-[#1AB6FF]/25 bg-[#1AB6FF]/10 px-3 py-3 text-sm font-semibold text-[#bdeaff]">
                    {pointageMessage}
                  </p>
                ) : null}
              </aside>
            </div>
          )}
        </section>

        <section>
          <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <h2 className="text-xl font-semibold text-[#e1e3e4]">Planning</h2>
              <p className="mt-1 text-sm text-[#acbdc5]">
                Consultation limitee aux deux semaines autorisees.
              </p>
            </div>

            <div className="flex w-full border border-[rgba(172,189,197,0.15)] bg-[#334149] p-1 sm:w-auto">
              {(["current", "next"] as WeekMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setWeekMode(mode)}
                  className={`h-9 flex-1 px-4 text-sm font-semibold transition sm:flex-none ${
                    weekMode === mode
                      ? "bg-[#1AB6FF] text-white"
                      : "text-[#acbdc5] hover:text-[#e1e3e4]"
                  }`}
                >
                  {mode === "current" ? "Cette semaine" : "Semaine prochaine"}
                </button>
              ))}
            </div>
          </div>

          {isWeekLoading ? (
            <LoadingPanel label="Chargement du planning..." />
          ) : weekError ? (
            <p className="border border-red-300/30 bg-red-500/10 px-4 py-5 text-sm text-red-100">
              {weekError}
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {weekRows.map((day, index) => (
                <DayCard key={day.date} day={day} index={index} />
              ))}
            </div>
          )}
        </section>

        <section className="mt-8">
          <div className="mb-5">
            <h2 className="text-xl font-semibold text-[#e1e3e4]">
              Mes absences
            </h2>
            <p className="mt-1 text-sm text-[#acbdc5]">
              Historique personnel des absences enregistr\u00e9es.
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
              Aucune absence enregistr\u00e9e.
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
                        Aucun pointage enregistr\u00e9
                      </p>
                    </div>
                    <StatusBadge tone="red">
                      {getPresenceStatus(absence) || "Absent"}
                    </StatusBadge>
                  </div>
                  <p className="text-sm text-[#acbdc5]">
                    Heure arriv\u00e9e: {getArrivalTime(absence) || "-"}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
