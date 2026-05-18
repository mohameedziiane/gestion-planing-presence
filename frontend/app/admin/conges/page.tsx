"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { ApiError, apiFetch } from "@/lib/api";
import {
  clearAuth,
  getDashboardPathByRole,
  getStoredUser,
  getToken,
  isRole,
} from "@/lib/auth";
import AdminNavbar from "@/components/AdminNavbar";

type CongeDemande = {
  id: number;
  employe_id: number;
  date_debut: string;
  date_fin: string;
  nombre_jours: number;
  type_conge: string;
  motif?: string | null;
  statut: string;
  commentaire_admin?: string | null;
  decided_at?: string | null;
  created_at?: string | null;
  prenom?: string | null;
  nom?: string | null;
  groupe?: string | null;
};

type DemandesResponse = {
  demandes?: CongeDemande[];
};

type EmployeeRow = {
  id?: number | string;
  prenom?: string | null;
  nom?: string | null;
  full_name?: string | null;
  nom_complet?: string | null;
  groupe?: string | null;
  groupe_nom?: string | null;
};

type MedicalDeduction = {
  id: number;
  employe_id: number;
  prenom?: string | null;
  nom?: string | null;
  groupe?: string | null;
  date_debut_absence: string;
  date_fin_absence: string;
  total_jours_absence: number;
  jours_couverts_certificat: number;
  jours_deduits_conge: number;
  commentaire_admin?: string | null;
  decided_at?: string | null;
  created_at?: string | null;
};

type MedicalDeductionsResponse = {
  deductions?: MedicalDeduction[];
};

type MedicalForm = {
  employe_id: string;
  date_debut_absence: string;
  date_fin_absence: string;
  jours_couverts_certificat: string;
  commentaire: string;
};

type FilterValue = "Tous" | "En attente" | "Accepté" | "Refusé";

const filters: FilterValue[] = ["Tous", "En attente", "Accepté", "Refusé"];

function getEmployeeName(demande: CongeDemande) {
  return [demande.prenom, demande.nom].filter(Boolean).join(" ").trim() || "-";
}

function getEmployeeRowName(employee: EmployeeRow) {
  return (
    employee.full_name ||
    employee.nom_complet ||
    [employee.prenom, employee.nom].filter(Boolean).join(" ").trim() ||
    "Employé non défini"
  );
}

function getMedicalDeductionEmployeeName(deduction: MedicalDeduction) {
  return [deduction.prenom, deduction.nom].filter(Boolean).join(" ").trim() || "-";
}

function getDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getTodayDateValue() {
  return getDateInputValue(new Date());
}

function getInclusiveDays(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0;
  }

  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
}

function getStatusClasses(status: string) {
  if (status === "Accepté") {
    return "border-[var(--color-badge-success-border)] bg-[var(--color-badge-success-bg)] text-[var(--color-badge-success-text)]";
  }

  if (status === "Refusé" || status === "Annulé") {
    return "border-[var(--color-badge-danger-border)] bg-[var(--color-badge-danger-bg)] text-[var(--color-badge-danger-text)]";
  }

  return "border-[var(--color-badge-warning-border)] bg-[var(--color-badge-warning-bg)] text-[var(--color-badge-warning-text)]";
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-[var(--color-text)]">{value}</p>
    </article>
  );
}

function PreviewCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold text-[var(--color-text)]">{value}</p>
    </article>
  );
}

export default function AdminCongesPage() {
  const router = useRouter();
  const [isAllowed, setIsAllowed] = useState(false);
  const [filter, setFilter] = useState<FilterValue>("Tous");
  const [demandes, setDemandes] = useState<CongeDemande[]>([]);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [medicalDeductions, setMedicalDeductions] = useState<
    MedicalDeduction[]
  >([]);
  const [medicalForm, setMedicalForm] = useState<MedicalForm>({
    employe_id: "",
    date_debut_absence: getTodayDateValue(),
    date_fin_absence: getTodayDateValue(),
    jours_couverts_certificat: "1",
    commentaire: "",
  });
  const [comments, setComments] = useState<Record<number, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isEmployeesLoading, setIsEmployeesLoading] = useState(true);
  const [isMedicalDeductionsLoading, setIsMedicalDeductionsLoading] =
    useState(true);
  const [isMedicalSubmitting, setIsMedicalSubmitting] = useState(false);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const totalMedicalAbsenceDays = useMemo(
    () =>
      getInclusiveDays(
        medicalForm.date_debut_absence,
        medicalForm.date_fin_absence
      ),
    [medicalForm.date_debut_absence, medicalForm.date_fin_absence]
  );
  const coveredMedicalDays =
    Number(medicalForm.jours_couverts_certificat) || 0;
  const deductedMedicalDays =
    totalMedicalAbsenceDays > 0 && coveredMedicalDays > 0
      ? Math.max(totalMedicalAbsenceDays - coveredMedicalDays, 0)
      : 0;
  const medicalValidationMessage = useMemo(() => {
    if (!medicalForm.employe_id) {
      return "Employé requis.";
    }

    if (totalMedicalAbsenceDays <= 0) {
      return "La date de début doit être avant ou égale à la date de fin.";
    }

    if (!Number.isInteger(coveredMedicalDays) || coveredMedicalDays <= 0) {
      return "Les jours couverts doivent être un entier positif.";
    }

    if (coveredMedicalDays > totalMedicalAbsenceDays) {
      return "Les jours couverts ne peuvent pas dépasser le total d'absence.";
    }

    return "";
  }, [coveredMedicalDays, medicalForm.employe_id, totalMedicalAbsenceDays]);
  const pendingDemandes = useMemo(
    () => demandes.filter((demande) => demande.statut === "En attente"),
    [demandes]
  );
  const historyDemandes = useMemo(
    () =>
      demandes.filter(
        (demande) =>
          demande.statut !== "En attente" &&
          (filter === "Tous" || demande.statut === filter)
      ),
    [demandes, filter]
  );
  const summary = useMemo(
    () => ({
      total: demandes.length,
      pending: demandes.filter((demande) => demande.statut === "En attente")
        .length,
      accepted: demandes.filter((demande) => demande.statut === "Accepté")
        .length,
      refused: demandes.filter((demande) => demande.statut === "Refusé")
        .length,
    }),
    [demandes]
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

  const loadDemandes = useCallback(async () => {
    if (!isAllowed) {
      return;
    }

    setIsLoading(true);
    setErrorMessage("");

    try {
      const payload = await apiFetch<DemandesResponse>(
        "/api/conges/admin/demandes"
      );

      setDemandes(Array.isArray(payload.demandes) ? payload.demandes : []);
    } catch (error) {
      setDemandes([]);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Impossible de charger les demandes."
      );
    } finally {
      setIsLoading(false);
    }
  }, [isAllowed]);

  const loadEmployees = useCallback(async () => {
    if (!isAllowed) {
      return;
    }

    setIsEmployeesLoading(true);

    try {
      const payload = await apiFetch<unknown>("/api/employes");

      setEmployees(Array.isArray(payload) ? (payload as EmployeeRow[]) : []);
    } catch (error) {
      setEmployees([]);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Impossible de charger les employés."
      );
    } finally {
      setIsEmployeesLoading(false);
    }
  }, [isAllowed]);

  const loadMedicalDeductions = useCallback(async () => {
    if (!isAllowed) {
      return;
    }

    setIsMedicalDeductionsLoading(true);

    try {
      const payload = await apiFetch<MedicalDeductionsResponse>(
        "/api/conges/admin/medical-deductions"
      );

      setMedicalDeductions(
        Array.isArray(payload.deductions) ? payload.deductions : []
      );
    } catch (error) {
      setMedicalDeductions([]);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Impossible de charger les déductions médicales."
      );
    } finally {
      setIsMedicalDeductionsLoading(false);
    }
  }, [isAllowed]);

  useEffect(() => {
    if (!isAllowed) {
      return;
    }

    Promise.resolve().then(() => {
      void loadDemandes();
      void loadEmployees();
      void loadMedicalDeductions();
    });
  }, [isAllowed, loadDemandes, loadEmployees, loadMedicalDeductions]);

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

  function updateMedicalForm(patch: Partial<MedicalForm>) {
    setMedicalForm((currentForm) => ({
      ...currentForm,
      ...patch,
    }));
    setErrorMessage("");
    setSuccessMessage("");
  }

  async function handleMedicalDeductionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    if (medicalValidationMessage) {
      setErrorMessage(medicalValidationMessage);
      return;
    }

    setIsMedicalSubmitting(true);

    try {
      await apiFetch("/api/conges/admin/medical-deductions", {
        method: "POST",
        body: JSON.stringify({
          employe_id: Number(medicalForm.employe_id),
          date_debut_absence: medicalForm.date_debut_absence,
          date_fin_absence: medicalForm.date_fin_absence,
          jours_couverts_certificat: Number(
            medicalForm.jours_couverts_certificat
          ),
          commentaire: medicalForm.commentaire,
        }),
      });

      setSuccessMessage("Déduction médicale appliquée avec succès.");
      setMedicalForm({
        employe_id: "",
        date_debut_absence: getTodayDateValue(),
        date_fin_absence: getTodayDateValue(),
        jours_couverts_certificat: "1",
        commentaire: "",
      });
      await Promise.all([loadMedicalDeductions(), loadDemandes()]);
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError || error instanceof Error
          ? error.message
          : "Impossible d'appliquer la déduction médicale."
      );
    } finally {
      setIsMedicalSubmitting(false);
    }
  }

  async function decide(id: number, action: "accept" | "refuse") {
    setActiveId(id);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      await apiFetch(`/api/conges/admin/demandes/${id}/${action}`, {
        method: "POST",
        body: JSON.stringify({
          commentaire_admin: comments[id] || "",
        }),
      });
      setSuccessMessage(
        action === "accept"
          ? "Demande acceptée avec succès."
          : "Demande refusée avec succès."
      );
      await loadDemandes();
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError || error instanceof Error
          ? error.message
          : "Impossible de traiter la demande."
      );
    } finally {
      setActiveId(null);
    }
  }

  if (!isAllowed) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-6 text-[var(--color-text)]">
        <p className="text-sm font-semibold text-[var(--color-text-muted)]">Chargement...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[var(--color-bg)] text-[var(--color-text)]">
      <AdminNavbar onLogout={handleLogout} />

      <section className="mx-auto w-full max-w-[1180px] px-4 py-8 sm:px-6 lg:py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-[var(--color-text)] sm:text-3xl">
            Gestion des congés
          </h1>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            Traitez les demandes de congé envoyées par les employés.
          </p>
        </div>

        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="Total demandes" value={summary.total} />
          <SummaryCard label="En attente" value={summary.pending} />
          <SummaryCard label="Acceptées" value={summary.accepted} />
          <SummaryCard label="Refusées" value={summary.refused} />
        </div>

        {errorMessage ? (
          <p className="mb-5 border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-4 py-3 text-sm text-[var(--color-danger-text)]">
            {errorMessage}
          </p>
        ) : null}
        {successMessage ? (
          <p className="mb-5 border border-[var(--color-success-border)] bg-[var(--color-success-bg)] px-4 py-3 text-sm text-[var(--color-success-text)]">
            {successMessage}
          </p>
        ) : null}

        <section className="mb-8 border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-5">
          <div className="mb-5">
            <h2 className="text-xl font-semibold text-[var(--color-text)]">
              Déduction congé pour absence médicale
            </h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Calculez les jours à déduire du solde congé lorsqu&apos;un certificat médical ne couvre qu&apos;une partie de l&apos;absence.
            </p>
          </div>

          <form onSubmit={handleMedicalDeductionSubmit}>
            <div className="grid gap-4 lg:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--color-text-muted)]">
                Employé
                <select
                  value={medicalForm.employe_id}
                  onChange={(event) =>
                    updateMedicalForm({ employe_id: event.target.value })
                  }
                  disabled={isEmployeesLoading}
                  required
                  className="h-10 border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 text-[var(--color-text)] outline-none focus:border-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <option value="">
                    {isEmployeesLoading
                      ? "Chargement des employés..."
                      : "Sélectionner un employé"}
                  </option>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {getEmployeeRowName(employee)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--color-text-muted)]">
                Jours couverts par certificat
                <input
                  type="number"
                  min="1"
                  value={medicalForm.jours_couverts_certificat}
                  onChange={(event) =>
                    updateMedicalForm({
                      jours_couverts_certificat: event.target.value,
                    })
                  }
                  required
                  className="h-10 border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--color-text-muted)]">
                Date début absence
                <input
                  type="date"
                  value={medicalForm.date_debut_absence}
                  onChange={(event) =>
                    updateMedicalForm({
                      date_debut_absence: event.target.value,
                    })
                  }
                  required
                  className="h-10 border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--color-text-muted)]">
                Date fin absence
                <input
                  type="date"
                  value={medicalForm.date_fin_absence}
                  onChange={(event) =>
                    updateMedicalForm({
                      date_fin_absence: event.target.value,
                    })
                  }
                  required
                  className="h-10 border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                />
              </label>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <PreviewCard
                label="Total jours absence"
                value={Math.max(totalMedicalAbsenceDays, 0)}
              />
              <PreviewCard
                label="Jours couverts certificat"
                value={coveredMedicalDays}
              />
              <PreviewCard
                label="Jours à déduire"
                value={deductedMedicalDays}
              />
            </div>

            <label className="mt-4 flex flex-col gap-2 text-sm font-semibold text-[var(--color-text-muted)]">
              Commentaire
              <textarea
                value={medicalForm.commentaire}
                onChange={(event) =>
                  updateMedicalForm({ commentaire: event.target.value })
                }
                rows={3}
                className="border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
              />
            </label>

            {medicalValidationMessage ? (
              <p className="mt-4 border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] px-4 py-3 text-sm text-[var(--color-warning-text)]">
                {medicalValidationMessage}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isMedicalSubmitting || Boolean(medicalValidationMessage)}
              className="mt-4 h-10 border border-transparent bg-[var(--color-accent)] px-5 text-sm font-bold text-white transition hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isMedicalSubmitting
                ? "Application..."
                : "Appliquer la déduction"}
            </button>
          </form>
        </section>

        <section className="mb-8">
          <div className="mb-5">
            <h2 className="text-xl font-semibold text-[var(--color-text)]">
              Historique des déductions médicales
            </h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Déductions appliquées par l&apos;administration pour absences médicales partiellement couvertes.
            </p>
          </div>

          {isMedicalDeductionsLoading ? (
            <p className="border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-5 text-sm text-[var(--color-text-muted)]">
              Chargement des déductions médicales...
            </p>
          ) : medicalDeductions.length === 0 ? (
            <p className="border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-5 text-sm text-[var(--color-text-muted)]">
              Aucune déduction médicale enregistrée.
            </p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {medicalDeductions.map((deduction) => (
                <article
                  key={deduction.id}
                  className="border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-[var(--color-text)]">
                        {getMedicalDeductionEmployeeName(deduction)}
                      </h3>
                      <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                        {deduction.groupe || "-"}
                      </p>
                    </div>
                    <span className="border border-[var(--color-accent)]/25 bg-[var(--color-accent)]/10 px-2.5 py-1 text-xs font-semibold text-[var(--color-accent)]">
                      {deduction.jours_deduits_conge} jour(s) déduit(s)
                    </span>
                  </div>
                  <div className="grid gap-3 text-sm text-[var(--color-text-muted)] sm:grid-cols-2">
                    <p>
                      Période: {deduction.date_debut_absence} -{" "}
                      {deduction.date_fin_absence}
                    </p>
                    <p>Total absence: {deduction.total_jours_absence}</p>
                    <p>
                      Couverts certificat:{" "}
                      {deduction.jours_couverts_certificat}
                    </p>
                    <p>Déduits congé: {deduction.jours_deduits_conge}</p>
                  </div>
                  <p className="mt-3 text-sm text-[var(--color-text-muted)]">
                    Commentaire admin: {deduction.commentaire_admin || "-"}
                  </p>
                  <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                    Date d&apos;application: {deduction.decided_at || deduction.created_at || "-"}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>

        {isLoading ? (
          <p className="border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-5 text-sm text-[var(--color-text-muted)]">
            Chargement des demandes...
          </p>
        ) : demandes.length === 0 ? (
          <p className="border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-5 text-sm text-[var(--color-text-muted)]">
            Aucune demande trouvée.
          </p>
        ) : (
          <>
            <section className="mb-8 border border-l-4 border-[var(--color-border)] border-l-[var(--color-accent)] bg-[var(--color-surface)] p-4 sm:p-5">
              <div className="mb-5">
                <h2 className="text-xl font-semibold text-[var(--color-text)]">
                  Demandes en attente
                </h2>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                  Les demandes à traiter en priorité.
                </p>
              </div>

              {pendingDemandes.length === 0 ? (
                <p className="border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-5 text-sm text-[var(--color-text-muted)]">
                  Aucune demande de congé en attente.
                </p>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  {pendingDemandes.map((demande) => (
                    <article
                      key={demande.id}
                      className="border border-yellow-300/25 bg-[var(--color-surface-muted)] p-4"
                    >
                      <div className="mb-4 flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-base font-semibold text-[var(--color-text)]">
                            {getEmployeeName(demande)}
                          </h3>
                          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                            {demande.groupe || "-"}
                          </p>
                        </div>
                        <span className={`border px-2.5 py-1 text-xs font-semibold ${getStatusClasses(demande.statut)}`}>
                          {demande.statut}
                        </span>
                      </div>
                      <div className="grid gap-3 text-sm text-[var(--color-text-muted)] sm:grid-cols-2">
                        <p>Début: {demande.date_debut}</p>
                        <p>Fin: {demande.date_fin}</p>
                        <p>Jours: {demande.nombre_jours}</p>
                        <p>Type: {demande.type_conge}</p>
                      </div>
                      <p className="mt-3 text-sm text-[var(--color-text-muted)]">
                        Motif: {demande.motif || "-"}
                      </p>
                      <textarea
                        value={comments[demande.id] || ""}
                        onChange={(event) =>
                          updateComment(demande.id, event.target.value)
                        }
                        rows={2}
                        placeholder="Commentaire admin"
                        className="mt-4 w-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)]"
                      />
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => decide(demande.id, "accept")}
                          disabled={activeId === demande.id}
                          className="h-9 border border-[var(--color-action-success-border)] bg-[var(--color-action-success-bg)] px-3 text-sm font-semibold text-[var(--color-action-success-text)] transition hover:bg-emerald-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          Accepter
                        </button>
                        <button
                          type="button"
                          onClick={() => decide(demande.id, "refuse")}
                          disabled={activeId === demande.id}
                          className="h-9 border border-[var(--color-action-danger-border)] bg-[var(--color-action-danger-bg)] px-3 text-sm font-semibold text-[var(--color-action-danger-text)] transition hover:bg-red-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-70"
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
                  <h2 className="text-xl font-semibold text-[var(--color-text)]">
                    Historique des demandes
                  </h2>
                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                    Demandes acceptées, refusées ou annulées.
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
                          ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white"
                          : "border-[var(--color-action-primary-border)] bg-[var(--color-action-primary-bg)] text-[var(--color-action-primary-text)] hover:bg-[var(--color-accent)] hover:text-white"
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>

              {historyDemandes.length === 0 ? (
                <p className="border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-5 text-sm text-[var(--color-text-muted)]">
                  Aucune demande historique trouvée.
                </p>
              ) : (
          <section className="overflow-x-auto border border-[var(--color-border)] bg-[var(--color-surface)]">
            <table className="w-full min-w-[1180px] border-collapse text-sm">
              <thead className="bg-[var(--color-surface-muted)] text-left">
                <tr>
                  {[
                    "Employé",
                    "Dates",
                    "Jours",
                    "Type",
                    "Statut",
                    "Motif",
                    "Commentaire admin",
                    "Actions",
                  ].map((label) => (
                    <th
                      key={label}
                      className="border border-[var(--color-border)] px-4 py-3 text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {historyDemandes.map((demande) => (
                  <tr key={demande.id} className="align-top">
                    <td className="border border-[var(--color-border)] px-4 py-3">
                      <p className="font-semibold text-[var(--color-text)]">
                        {getEmployeeName(demande)}
                      </p>
                      <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                        {demande.groupe || "-"}
                      </p>
                    </td>
                    <td className="border border-[var(--color-border)] px-4 py-3 text-[var(--color-text-muted)]">
                      {demande.date_debut} - {demande.date_fin}
                    </td>
                    <td className="border border-[var(--color-border)] px-4 py-3 text-[var(--color-text)]">
                      {demande.nombre_jours}
                    </td>
                    <td className="border border-[var(--color-border)] px-4 py-3 text-[var(--color-text-muted)]">
                      {demande.type_conge}
                    </td>
                    <td className="border border-[var(--color-border)] px-4 py-3">
                      <span className={`border px-2.5 py-1 text-xs font-semibold ${getStatusClasses(demande.statut)}`}>
                        {demande.statut}
                      </span>
                    </td>
                    <td className="max-w-[220px] border border-[var(--color-border)] px-4 py-3 text-[var(--color-text-muted)]">
                      {demande.motif || "-"}
                    </td>
                    <td className="border border-[var(--color-border)] px-4 py-3">
                      {demande.statut === "En attente" ? (
                        <textarea
                          value={comments[demande.id] || ""}
                          onChange={(event) =>
                            updateComment(demande.id, event.target.value)
                          }
                          rows={2}
                          placeholder="Commentaire"
                          className="w-56 border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)]"
                        />
                      ) : (
                        <div>
                          <p className="text-[var(--color-text-muted)]">
                            {demande.commentaire_admin || "-"}
                          </p>
                          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                            {demande.decided_at || ""}
                          </p>
                        </div>
                      )}
                    </td>
                    <td className="border border-[var(--color-border)] px-4 py-3">
                      {demande.statut === "En attente" ? (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => decide(demande.id, "accept")}
                            disabled={activeId === demande.id}
                            className="h-9 border border-[var(--color-action-success-border)] bg-[var(--color-action-success-bg)] px-3 text-sm font-semibold text-[var(--color-action-success-text)] transition hover:bg-emerald-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            Accepter
                          </button>
                          <button
                            type="button"
                            onClick={() => decide(demande.id, "refuse")}
                            disabled={activeId === demande.id}
                            className="h-9 border border-[var(--color-action-danger-border)] bg-[var(--color-action-danger-bg)] px-3 text-sm font-semibold text-[var(--color-action-danger-text)] transition hover:bg-red-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            Refuser
                          </button>
                        </div>
                      ) : (
                        <span className="text-[var(--color-text-muted)]">Traitée</span>
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
