"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { apiFetch } from "@/lib/api";
import {
  clearAuth,
  getDashboardPathByRole,
  getStoredUser,
  getToken,
  isRole,
  type StoredUser,
} from "@/lib/auth";

type Certificat = {
  id: number;
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
};

type CertificatsResponse = {
  certificats?: Certificat[];
};

function formatDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getTodayDateValue() {
  return formatDateValue(new Date());
}

function getEmployeeName(user: StoredUser | null) {
  const name = [user?.employe?.prenom, user?.employe?.nom]
    .filter(Boolean)
    .join(" ")
    .trim();

  return name || user?.email || "Employe";
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
  if (status === "Valid\u00e9") {
    return "border-emerald-300/25 bg-emerald-400/10 text-emerald-100";
  }

  if (status === "Refus\u00e9") {
    return "border-[var(--color-badge-danger-border)] bg-[var(--color-badge-danger-bg)] text-[var(--color-badge-danger-text)]";
  }

  return "border-yellow-300/25 bg-yellow-400/10 text-yellow-100";
}

function PreviewCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="border border-[rgba(172,189,197,0.15)] bg-[#334149] p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#acbdc5]">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold text-[#e1e3e4]">{value}</p>
    </article>
  );
}

export default function EmployeCertificatsPage() {
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [isAllowed, setIsAllowed] = useState(false);
  const [certificats, setCertificats] = useState<Certificat[]>([]);
  const [dateDebut, setDateDebut] = useState(getTodayDateValue);
  const [dateFin, setDateFin] = useState(getTodayDateValue);
  const [joursCouverts, setJoursCouverts] = useState("1");
  const [motif, setMotif] = useState("");
  const [fichierUrl, setFichierUrl] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const totalJours = useMemo(
    () => getInclusiveDays(dateDebut, dateFin),
    [dateDebut, dateFin]
  );
  const coveredDays = Number(joursCouverts) || 0;
  const deductedDays =
    totalJours > 0 && coveredDays > 0
      ? Math.max(totalJours - coveredDays, 0)
      : 0;

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

  const loadCertificats = useCallback(async () => {
    if (!isAllowed) {
      return;
    }

    setIsLoading(true);
    setErrorMessage("");

    try {
      const payload = await apiFetch<CertificatsResponse>("/api/certificats/me");

      setCertificats(
        Array.isArray(payload.certificats) ? payload.certificats : []
      );
    } catch (error) {
      setCertificats([]);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Impossible de charger vos certificats."
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      await apiFetch("/api/certificats/me", {
        method: "POST",
        body: JSON.stringify({
          date_debut_absence: dateDebut,
          date_fin_absence: dateFin,
          jours_couverts_certificat: Number(joursCouverts),
          motif,
          fichier_url: fichierUrl,
        }),
      });

      setMotif("");
      setFichierUrl("");
      setSuccessMessage("Certificat envoy\u00e9 avec succ\u00e8s.");
      await loadCertificats();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Impossible d\u2019envoyer le certificat."
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
      <header className="sticky top-0 z-50 border-b border-[rgba(172,189,197,0.15)] bg-[#38474e]">
        <nav className="mx-auto flex min-h-[78px] w-full max-w-[1180px] flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/employe" className="flex items-center gap-3">
            <Image
              src="/logo.png"
              alt="Gare Routiere de Taza"
              width={48}
              height={48}
              priority
              className="h-12 w-12 object-contain"
            />
            <div>
              <p className="text-sm font-semibold text-[#e1e3e4]">
                Mes certificats m\u00e9dicaux
              </p>
              <p className="text-xs text-[#acbdc5]">Gare Routiere de Taza</p>
            </div>
          </Link>
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
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-2xl font-semibold text-[#e1e3e4] sm:text-3xl">
              Mes certificats m\u00e9dicaux
            </h1>
            <p className="mt-2 text-sm text-[#acbdc5]">
              D\u00e9clarez les jours couverts par certificat m\u00e9dical.
            </p>
          </div>
          <Link
            href="/employe"
            className="border border-[rgba(172,189,197,0.18)] px-4 py-2 text-sm font-semibold text-[#acbdc5] transition hover:border-[#1AB6FF] hover:text-[#e1e3e4]"
          >
            Retour tableau de bord
          </Link>
        </div>

        {errorMessage ? (
          <p className="mb-5 border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-4 py-3 text-sm text-[var(--color-danger-text)]">
            {errorMessage}
          </p>
        ) : null}
        {successMessage ? (
          <p className="mb-5 border border-emerald-300/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            {successMessage}
          </p>
        ) : null}

        <form
          onSubmit={handleSubmit}
          className="mb-8 border border-[rgba(172,189,197,0.15)] bg-[#38474e] p-4 sm:p-5"
        >
          <h2 className="mb-4 text-xl font-semibold text-[#e1e3e4]">
            Envoyer un certificat
          </h2>
          <div className="grid gap-4 lg:grid-cols-3">
            <label className="flex flex-col gap-2 text-sm font-semibold text-[#acbdc5]">
              Date d\u00e9but absence
              <input
                type="date"
                value={dateDebut}
                onChange={(event) => setDateDebut(event.target.value)}
                required
                className="h-10 border border-[rgba(172,189,197,0.15)] bg-[#334149] px-3 text-[#e1e3e4] outline-none focus:border-[#1AB6FF]"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold text-[#acbdc5]">
              Date fin absence
              <input
                type="date"
                value={dateFin}
                onChange={(event) => setDateFin(event.target.value)}
                required
                className="h-10 border border-[rgba(172,189,197,0.15)] bg-[#334149] px-3 text-[#e1e3e4] outline-none focus:border-[#1AB6FF]"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold text-[#acbdc5]">
              Jours couverts
              <input
                type="number"
                min="1"
                value={joursCouverts}
                onChange={(event) => setJoursCouverts(event.target.value)}
                required
                className="h-10 border border-[rgba(172,189,197,0.15)] bg-[#334149] px-3 text-[#e1e3e4] outline-none focus:border-[#1AB6FF]"
              />
            </label>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <PreviewCard label="Total jours absence" value={Math.max(totalJours, 0)} />
            <PreviewCard label="Jours couverts" value={coveredDays} />
            <PreviewCard label="Jours \u00e0 d\u00e9duire" value={deductedDays} />
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
          <label className="mt-4 flex flex-col gap-2 text-sm font-semibold text-[#acbdc5]">
            Fichier URL
            <input
              type="url"
              value={fichierUrl}
              onChange={(event) => setFichierUrl(event.target.value)}
              className="h-10 border border-[rgba(172,189,197,0.15)] bg-[#334149] px-3 text-[#e1e3e4] outline-none focus:border-[#1AB6FF]"
            />
          </label>
          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-4 h-10 bg-[#1AB6FF] px-5 text-sm font-bold text-white transition hover:bg-[#169CDC] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? "Envoi..." : "Envoyer le certificat"}
          </button>
        </form>

        <section>
          <h2 className="mb-4 text-xl font-semibold text-[#e1e3e4]">
            Historique
          </h2>
          {isLoading ? (
            <p className="border border-[rgba(172,189,197,0.15)] bg-[#38474e] px-4 py-5 text-sm text-[#acbdc5]">
              Chargement des certificats...
            </p>
          ) : certificats.length === 0 ? (
            <p className="border border-[rgba(172,189,197,0.15)] bg-[#38474e] px-4 py-5 text-sm text-[#acbdc5]">
              Aucun certificat enregistr\u00e9.
            </p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {certificats.map((certificat) => (
                <article
                  key={certificat.id}
                  className="border border-[rgba(172,189,197,0.15)] bg-[#38474e] p-4"
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-[#e1e3e4]">
                        {certificat.date_debut_absence} -{" "}
                        {certificat.date_fin_absence}
                      </h3>
                      <p className="mt-1 text-sm text-[#acbdc5]">
                        {certificat.total_jours_absence} jour(s) absence
                      </p>
                    </div>
                    <span className={`border px-2.5 py-1 text-xs font-semibold ${getStatusClasses(certificat.statut)}`}>
                      {certificat.statut}
                    </span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <p className="text-sm text-[#acbdc5]">
                      Couverts: {certificat.jours_couverts_certificat}
                    </p>
                    <p className="text-sm text-[#acbdc5]">
                      D\u00e9duits cong\u00e9: {certificat.jours_deduits_conge}
                    </p>
                  </div>
                  <p className="mt-3 text-sm text-[#acbdc5]">
                    Motif: {certificat.motif || "-"}
                  </p>
                  <p className="mt-2 text-sm text-[#acbdc5]">
                    Commentaire admin: {certificat.commentaire_admin || "-"}
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
