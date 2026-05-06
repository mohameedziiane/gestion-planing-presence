"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ApiError, apiFetch } from "@/lib/api";
import {
  clearAuth,
  getDashboardPathByRole,
  getStoredUser,
  getToken,
  isRole,
} from "@/lib/auth";
import AdminNavbar from "@/components/AdminNavbar";

type Certificat = {
  id: number;
  employe_id: number;
  date_debut_absence: string;
  date_fin_absence: string;
  total_jours_absence: number;
  jours_couverts_certificat: number;
  jours_deduits_conge: number;
  motif?: string | null;
  fichier_url?: string | null;
  statut: string;
  commentaire_admin?: string | null;
  decided_at?: string | null;
  created_at?: string | null;
  prenom?: string | null;
  nom?: string | null;
  groupe?: string | null;
};

type CertificatsResponse = {
  certificats?: Certificat[];
};

type FilterValue = "Tous" | "En attente" | "Valid\u00e9" | "Refus\u00e9";

const filters: FilterValue[] = ["Tous", "En attente", "Valid\u00e9", "Refus\u00e9"];

function getEmployeeName(certificat: Certificat) {
  return [certificat.prenom, certificat.nom].filter(Boolean).join(" ").trim() || "-";
}

function getStatusClasses(status: string) {
  if (status === "Valid\u00e9") {
    return "border-emerald-300/25 bg-emerald-400/10 text-emerald-100";
  }

  if (status === "Refus\u00e9") {
    return "border-red-300/25 bg-red-400/10 text-red-100";
  }

  return "border-yellow-300/25 bg-yellow-400/10 text-yellow-100";
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="border border-[rgba(172,189,197,0.15)] bg-[#38474e] p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#acbdc5]">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-[#e1e3e4]">{value}</p>
    </article>
  );
}

export default function AdminCertificatsPage() {
  const router = useRouter();
  const [isAllowed, setIsAllowed] = useState(false);
  const [filter, setFilter] = useState<FilterValue>("Tous");
  const [certificats, setCertificats] = useState<Certificat[]>([]);
  const [comments, setComments] = useState<Record<number, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const pendingCertificats = useMemo(
    () =>
      certificats.filter((certificat) => certificat.statut === "En attente"),
    [certificats]
  );
  const historyCertificats = useMemo(
    () =>
      certificats.filter(
        (certificat) =>
          certificat.statut !== "En attente" &&
          (filter === "Tous" || certificat.statut === filter)
      ),
    [certificats, filter]
  );
  const summary = useMemo(
    () => ({
      total: certificats.length,
      pending: certificats.filter(
        (certificat) => certificat.statut === "En attente"
      ).length,
      validated: certificats.filter(
        (certificat) => certificat.statut === "Valid\u00e9"
      ).length,
      refused: certificats.filter(
        (certificat) => certificat.statut === "Refus\u00e9"
      ).length,
    }),
    [certificats]
  );

  useEffect(() => {
    const token = getToken();
    const user = getStoredUser();

    if (!token || !user) {
      router.push("/");
      return;
    }

    if (isRole(user, "employe") || isRole(user, "directeur")) {
      router.push(getDashboardPathByRole(user.role));
      return;
    }

    if (!isRole(user, "admin")) {
      router.push("/");
      return;
    }

    Promise.resolve().then(() => setIsAllowed(true));
  }, [router]);

  const loadCertificats = useCallback(async () => {
    if (!isAllowed) {
      return;
    }

    setIsLoading(true);
    setErrorMessage("");

    try {
      const payload = await apiFetch<CertificatsResponse>(
        "/api/certificats/admin"
      );

      setCertificats(
        Array.isArray(payload.certificats) ? payload.certificats : []
      );
    } catch (error) {
      setCertificats([]);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Impossible de charger les certificats."
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
      void loadCertificats();
    });
  }, [isAllowed, loadCertificats]);

  function handleLogout() {
    clearAuth();
    router.push("/");
  }

  function updateComment(id: number, value: string) {
    setComments((currentComments) => ({
      ...currentComments,
      [id]: value,
    }));
  }

  async function decide(id: number, action: "validate" | "refuse") {
    setActiveId(id);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      await apiFetch(`/api/certificats/admin/${id}/${action}`, {
        method: "POST",
        body: JSON.stringify({
          commentaire_admin: comments[id] || "",
        }),
      });
      setSuccessMessage(
        action === "validate"
          ? "Certificat valid\u00e9 avec succ\u00e8s."
          : "Certificat refus\u00e9 avec succ\u00e8s."
      );
      await loadCertificats();
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError || error instanceof Error
          ? error.message
          : "Impossible de traiter le certificat."
      );
    } finally {
      setActiveId(null);
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
      <AdminNavbar onLogout={handleLogout} />

      <section className="mx-auto w-full max-w-[1180px] px-4 py-8 sm:px-6 lg:py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-[#e1e3e4] sm:text-3xl">
            Gestion des certificats m\u00e9dicaux
          </h1>
          <p className="mt-2 text-sm text-[#acbdc5]">
            Validez ou refusez les certificats m\u00e9dicaux envoy\u00e9s par les employ\u00e9s.
          </p>
        </div>

        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="Total certificats" value={summary.total} />
          <SummaryCard label="En attente" value={summary.pending} />
          <SummaryCard label="Valid\u00e9s" value={summary.validated} />
          <SummaryCard label="Refus\u00e9s" value={summary.refused} />
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
            Chargement des certificats...
          </p>
        ) : certificats.length === 0 ? (
          <p className="border border-[rgba(172,189,197,0.15)] bg-[#38474e] px-4 py-5 text-sm text-[#acbdc5]">
            Aucun certificat trouv\u00e9.
          </p>
        ) : (
          <>
            <section className="mb-8 border border-l-4 border-[rgba(172,189,197,0.15)] border-l-[#1AB6FF] bg-[#38474e] p-4 sm:p-5">
              <div className="mb-5">
                <h2 className="text-xl font-semibold text-[#e1e3e4]">
                  Certificats en attente
                </h2>
                <p className="mt-1 text-sm text-[#acbdc5]">
                  Les certificats m\u00e9dicaux \u00e0 traiter en priorit\u00e9.
                </p>
              </div>

              {pendingCertificats.length === 0 ? (
                <p className="border border-[rgba(172,189,197,0.15)] bg-[#334149] px-4 py-5 text-sm text-[#acbdc5]">
                  Aucun certificat m\u00e9dical en attente.
                </p>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  {pendingCertificats.map((certificat) => (
                    <article
                      key={certificat.id}
                      className="border border-yellow-300/25 bg-[#334149] p-4"
                    >
                      <div className="mb-4 flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-base font-semibold text-[#e1e3e4]">
                            {getEmployeeName(certificat)}
                          </h3>
                          <p className="mt-1 text-sm text-[#acbdc5]">
                            {certificat.groupe || "-"}
                          </p>
                        </div>
                        <span className={`border px-2.5 py-1 text-xs font-semibold ${getStatusClasses(certificat.statut)}`}>
                          {certificat.statut}
                        </span>
                      </div>
                      <div className="grid gap-3 text-sm text-[#acbdc5] sm:grid-cols-2">
                        <p>D\u00e9but absence: {certificat.date_debut_absence}</p>
                        <p>Fin absence: {certificat.date_fin_absence}</p>
                        <p>Total absence: {certificat.total_jours_absence}</p>
                        <p>Couverts: {certificat.jours_couverts_certificat}</p>
                        <p>D\u00e9duits cong\u00e9: {certificat.jours_deduits_conge}</p>
                      </div>
                      <p className="mt-3 text-sm text-[#acbdc5]">
                        Motif: {certificat.motif || "-"}
                      </p>
                      <textarea
                        value={comments[certificat.id] || ""}
                        onChange={(event) =>
                          updateComment(certificat.id, event.target.value)
                        }
                        rows={2}
                        placeholder="Commentaire admin"
                        className="mt-4 w-full border border-[rgba(172,189,197,0.15)] bg-[#38474e] px-3 py-2 text-sm text-[#e1e3e4] outline-none placeholder:text-[#acbdc5] focus:border-[#1AB6FF]"
                      />
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => decide(certificat.id, "validate")}
                          disabled={activeId === certificat.id}
                          className="h-9 border border-emerald-300/30 px-3 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/10 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          Valider
                        </button>
                        <button
                          type="button"
                          onClick={() => decide(certificat.id, "refuse")}
                          disabled={activeId === certificat.id}
                          className="h-9 border border-red-300/30 px-3 text-sm font-semibold text-red-100 transition hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          Refuser
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section>
              <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                <div>
                  <h2 className="text-xl font-semibold text-[#e1e3e4]">
                    Historique des certificats
                  </h2>
                  <p className="mt-1 text-sm text-[#acbdc5]">
                    Certificats valid\u00e9s ou refus\u00e9s.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {filters.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setFilter(item)}
                      className={`h-9 border px-4 text-sm font-semibold transition ${
                        filter === item
                          ? "border-[#1AB6FF] bg-[#1AB6FF] text-white"
                          : "border-[rgba(172,189,197,0.18)] text-[#acbdc5] hover:border-[#1AB6FF] hover:text-[#e1e3e4]"
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>

              {historyCertificats.length === 0 ? (
                <p className="border border-[rgba(172,189,197,0.15)] bg-[#38474e] px-4 py-5 text-sm text-[#acbdc5]">
                  Aucun certificat historique trouv\u00e9.
                </p>
              ) : (
          <section className="overflow-x-auto border border-[rgba(172,189,197,0.15)] bg-[#38474e]">
            <table className="w-full min-w-[1240px] border-collapse text-sm">
              <thead className="bg-[#334149] text-left">
                <tr>
                  {[
                    "Employ\u00e9",
                    "P\u00e9riode absence",
                    "Total",
                    "Couverts",
                    "D\u00e9duits cong\u00e9",
                    "Statut",
                    "Motif",
                    "Commentaire admin",
                    "Actions",
                  ].map((label) => (
                    <th
                      key={label}
                      className="border border-[rgba(172,189,197,0.15)] px-4 py-3 text-xs font-bold uppercase tracking-wide text-[#acbdc5]"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {historyCertificats.map((certificat) => (
                  <tr key={certificat.id} className="align-top">
                    <td className="border border-[rgba(172,189,197,0.15)] px-4 py-3">
                      <p className="font-semibold text-[#e1e3e4]">
                        {getEmployeeName(certificat)}
                      </p>
                      <p className="mt-1 text-xs text-[#acbdc5]">
                        {certificat.groupe || "-"}
                      </p>
                    </td>
                    <td className="border border-[rgba(172,189,197,0.15)] px-4 py-3 text-[#acbdc5]">
                      {certificat.date_debut_absence} -{" "}
                      {certificat.date_fin_absence}
                    </td>
                    <td className="border border-[rgba(172,189,197,0.15)] px-4 py-3 text-[#e1e3e4]">
                      {certificat.total_jours_absence}
                    </td>
                    <td className="border border-[rgba(172,189,197,0.15)] px-4 py-3 text-[#e1e3e4]">
                      {certificat.jours_couverts_certificat}
                    </td>
                    <td className="border border-[rgba(172,189,197,0.15)] px-4 py-3 text-[#e1e3e4]">
                      {certificat.jours_deduits_conge}
                    </td>
                    <td className="border border-[rgba(172,189,197,0.15)] px-4 py-3">
                      <span className={`border px-2.5 py-1 text-xs font-semibold ${getStatusClasses(certificat.statut)}`}>
                        {certificat.statut}
                      </span>
                    </td>
                    <td className="max-w-[220px] border border-[rgba(172,189,197,0.15)] px-4 py-3 text-[#acbdc5]">
                      {certificat.motif || "-"}
                    </td>
                    <td className="border border-[rgba(172,189,197,0.15)] px-4 py-3">
                      {certificat.statut === "En attente" ? (
                        <textarea
                          value={comments[certificat.id] || ""}
                          onChange={(event) =>
                            updateComment(certificat.id, event.target.value)
                          }
                          rows={2}
                          placeholder="Commentaire"
                          className="w-56 border border-[rgba(172,189,197,0.15)] bg-[#334149] px-3 py-2 text-[#e1e3e4] outline-none placeholder:text-[#acbdc5] focus:border-[#1AB6FF]"
                        />
                      ) : (
                        <div>
                          <p className="text-[#acbdc5]">
                            {certificat.commentaire_admin || "-"}
                          </p>
                          <p className="mt-1 text-xs text-[#acbdc5]">
                            {certificat.decided_at || ""}
                          </p>
                        </div>
                      )}
                    </td>
                    <td className="border border-[rgba(172,189,197,0.15)] px-4 py-3">
                      {certificat.statut === "En attente" ? (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => decide(certificat.id, "validate")}
                            disabled={activeId === certificat.id}
                            className="h-9 border border-emerald-300/30 px-3 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/10 disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            Valider
                          </button>
                          <button
                            type="button"
                            onClick={() => decide(certificat.id, "refuse")}
                            disabled={activeId === certificat.id}
                            className="h-9 border border-red-300/30 px-3 text-sm font-semibold text-red-100 transition hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            Refuser
                          </button>
                        </div>
                      ) : (
                        <span className="text-[#acbdc5]">Trait\u00e9</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
              )}
            </section>
          </>
        )}
      </section>
    </main>
  );
}
