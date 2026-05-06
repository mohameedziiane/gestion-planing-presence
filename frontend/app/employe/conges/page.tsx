"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

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

type CongeSummary = {
  annee: number;
  total_jours: number;
  jours_utilises: number;
  jours_restants: number;
};

type CongeDemande = {
  id: number;
  date_debut: string;
  date_fin: string;
  nombre_jours: number;
  type_conge: string;
  motif?: string | null;
  statut: string;
  commentaire_admin?: string | null;
  decided_at?: string | null;
  created_at?: string | null;
};

type DemandesResponse = {
  demandes?: CongeDemande[];
};

const TYPE_ANNUAL = "Annuel";
const TYPE_EXCEPTIONAL = "Exceptionnel";

function formatDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getTodayDateValue() {
  return formatDateValue(new Date());
}

function getStatusClasses(status: string) {
  if (status === "Accept\u00e9") {
    return "border-emerald-300/25 bg-emerald-400/10 text-emerald-100";
  }

  if (status === "Refus\u00e9") {
    return "border-red-300/25 bg-red-400/10 text-red-100";
  }

  return "border-yellow-300/25 bg-yellow-400/10 text-yellow-100";
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="border border-[rgba(172,189,197,0.15)] bg-[#38474e] p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#acbdc5]">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-[#e1e3e4]">{value}</p>
    </article>
  );
}

export default function EmployeCongesPage() {
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [isAllowed, setIsAllowed] = useState(false);
  const [summary, setSummary] = useState<CongeSummary | null>(null);
  const [demandes, setDemandes] = useState<CongeDemande[]>([]);
  const [dateDebut, setDateDebut] = useState(getTodayDateValue);
  const [dateFin, setDateFin] = useState(getTodayDateValue);
  const [typeConge, setTypeConge] = useState(TYPE_ANNUAL);
  const [motif, setMotif] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const requestedDays = useMemo(() => {
    const start = new Date(`${dateDebut}T00:00:00`);
    const end = new Date(`${dateFin}T00:00:00`);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return 0;
    }

    return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  }, [dateDebut, dateFin]);

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
      setIsAllowed(true);
    });
  }, [router]);

  const loadConges = useCallback(async () => {
    if (!isAllowed) {
      return;
    }

    setIsLoading(true);
    setErrorMessage("");

    try {
      const [summaryPayload, demandesPayload] = await Promise.all([
        apiFetch<CongeSummary>("/api/conges/me/summary"),
        apiFetch<DemandesResponse>("/api/conges/me/demandes"),
      ]);

      setSummary(summaryPayload);
      setDemandes(
        Array.isArray(demandesPayload.demandes)
          ? demandesPayload.demandes
          : []
      );
    } catch (error) {
      setSummary(null);
      setDemandes([]);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Impossible de charger vos cong\u00e9s."
      );
    } finally {
      setIsLoading(false);
    }
  }, [isAllowed]);

  useEffect(() => {
    if (!isAllowed) {
      return;
    }

    Promise.resolve().then(() => {
      void loadConges();
    });
  }, [isAllowed, loadConges]);

  function handleLogout() {
    clearAuth();
    router.push("/");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      await apiFetch("/api/conges/me/demandes", {
        method: "POST",
        body: JSON.stringify({
          date_debut: dateDebut,
          date_fin: dateFin,
          type_conge: typeConge,
          motif,
        }),
      });

      setMotif("");
      setSuccessMessage("Demande envoy\u00e9e avec succ\u00e8s.");
      await loadConges();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Impossible d\u2019envoyer la demande."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isAllowed) {
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
          <div>
            <h1 className="text-2xl font-semibold text-[#e1e3e4] sm:text-3xl">
              Mes cong\u00e9s
            </h1>
            <p className="mt-2 text-sm text-[#acbdc5]">
              Consultation du solde et suivi des demandes.
            </p>
          </div>
        </div>

        {errorMessage ? (
          <p className="mb-5 border border-red-300/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {errorMessage}
          </p>
        ) : null}
        {successMessage ? (
          <p className="mb-5 border border-emerald-300/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            {successMessage}
          </p>
        ) : null}

        {isLoading ? (
          <p className="border border-[rgba(172,189,197,0.15)] bg-[#38474e] px-4 py-5 text-sm text-[#acbdc5]">
            Chargement des cong\u00e9s...
          </p>
        ) : (
          <>
            <div className="mb-6 grid gap-4 sm:grid-cols-3">
              <SummaryCard
                label="Solde annuel"
                value={`${summary?.total_jours ?? 18} jours`}
              />
              <SummaryCard
                label="Utilis\u00e9"
                value={`${summary?.jours_utilises ?? 0} jours`}
              />
              <SummaryCard
                label="Restant"
                value={`${summary?.jours_restants ?? 18} jours`}
              />
            </div>

            <form
              onSubmit={handleSubmit}
              className="mb-8 border border-[rgba(172,189,197,0.15)] bg-[#38474e] p-4 sm:p-5"
            >
              <h2 className="mb-4 text-xl font-semibold text-[#e1e3e4]">
                Nouvelle demande
              </h2>
              <div className="grid gap-4 lg:grid-cols-4">
                <label className="flex flex-col gap-2 text-sm font-semibold text-[#acbdc5]">
                  Date d\u00e9but
                  <input
                    type="date"
                    value={dateDebut}
                    onChange={(event) => setDateDebut(event.target.value)}
                    required
                    className="h-10 border border-[rgba(172,189,197,0.15)] bg-[#334149] px-3 text-[#e1e3e4] outline-none focus:border-[#1AB6FF]"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm font-semibold text-[#acbdc5]">
                  Date fin
                  <input
                    type="date"
                    value={dateFin}
                    onChange={(event) => setDateFin(event.target.value)}
                    required
                    className="h-10 border border-[rgba(172,189,197,0.15)] bg-[#334149] px-3 text-[#e1e3e4] outline-none focus:border-[#1AB6FF]"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm font-semibold text-[#acbdc5]">
                  Type cong\u00e9
                  <select
                    value={typeConge}
                    onChange={(event) => setTypeConge(event.target.value)}
                    className="h-10 border border-[rgba(172,189,197,0.15)] bg-[#334149] px-3 text-[#e1e3e4] outline-none focus:border-[#1AB6FF]"
                  >
                    <option value={TYPE_ANNUAL}>Annuel</option>
                    <option value={TYPE_EXCEPTIONAL}>Exceptionnel</option>
                  </select>
                </label>
                <div className="border border-[rgba(172,189,197,0.15)] bg-[#334149] p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#acbdc5]">
                    Jours demand\u00e9s
                  </p>
                  <p className="mt-1 text-lg font-semibold text-[#e1e3e4]">
                    {requestedDays > 0 ? requestedDays : 0}
                  </p>
                </div>
              </div>
              <label className="mt-4 flex flex-col gap-2 text-sm font-semibold text-[#acbdc5]">
                Motif
                <textarea
                  value={motif}
                  onChange={(event) => setMotif(event.target.value)}
                  rows={3}
                  className="border border-[rgba(172,189,197,0.15)] bg-[#334149] px-3 py-2 text-[#e1e3e4] outline-none focus:border-[#1AB6FF]"
                />
              </label>
              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-4 h-10 bg-[#1AB6FF] px-5 text-sm font-bold text-white transition hover:bg-[#169CDC] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmitting ? "Envoi..." : "Envoyer la demande"}
              </button>
            </form>

            <section>
              <h2 className="mb-4 text-xl font-semibold text-[#e1e3e4]">
                Mes demandes
              </h2>
              {demandes.length === 0 ? (
                <p className="border border-[rgba(172,189,197,0.15)] bg-[#38474e] px-4 py-5 text-sm text-[#acbdc5]">
                  Aucune demande enregistr\u00e9e.
                </p>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  {demandes.map((demande) => (
                    <article
                      key={demande.id}
                      className="border border-[rgba(172,189,197,0.15)] bg-[#38474e] p-4"
                    >
                      <div className="mb-4 flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-semibold text-[#e1e3e4]">
                            {demande.date_debut} - {demande.date_fin}
                          </h3>
                          <p className="mt-1 text-sm text-[#acbdc5]">
                            {demande.nombre_jours} jour(s) - {demande.type_conge}
                          </p>
                        </div>
                        <span className={`border px-2.5 py-1 text-xs font-semibold ${getStatusClasses(demande.statut)}`}>
                          {demande.statut}
                        </span>
                      </div>
                      <p className="text-sm text-[#acbdc5]">
                        Motif: {demande.motif || "-"}
                      </p>
                      <p className="mt-2 text-sm text-[#acbdc5]">
                        Commentaire admin: {demande.commentaire_admin || "-"}
                      </p>
                      <p className="mt-2 text-xs text-[#acbdc5]">
                        D\u00e9cision: {demande.decided_at || "-"}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </section>
    </main>
  );
}
