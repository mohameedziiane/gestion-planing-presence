"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type NestedRecord = Record<string, unknown>;
type EmployeeRow = Record<string, unknown> & {
  id?: number | string;
  groupe?: string | NestedRecord;
  utilisateur?: NestedRecord;
};

function getString(row: NestedRecord, keys: string[]) {
  for (const key of keys) {
    const value = row[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function getNested(row: NestedRecord, key: string) {
  const value = row[key];

  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as NestedRecord)
    : null;
}

function getBoolean(row: NestedRecord, keys: string[]) {
  for (const key of keys) {
    const value = row[key];

    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "number") {
      return value === 1;
    }

    if (typeof value === "string" && value.trim()) {
      const normalized = value.trim().toLowerCase();

      if (["1", "true", "oui", "yes"].includes(normalized)) {
        return true;
      }

      if (["0", "false", "non", "no"].includes(normalized)) {
        return false;
      }
    }
  }

  return false;
}

function getEmployeeName(row: EmployeeRow) {
  const directName = getString(row, ["full_name", "nom_complet"]);

  if (directName) {
    return directName;
  }

  return [
    getString(row, ["prenom", "employe_prenom"]),
    getString(row, ["nom", "employe_nom"]),
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function getGroupName(row: EmployeeRow) {
  const groupe = getNested(row, "groupe");

  if (groupe) {
    const nestedGroup = getString(groupe, ["nom", "name"]);

    if (nestedGroup) {
      return nestedGroup;
    }
  }

  return (
    getString(row, ["groupe", "groupe_nom", "groupe_name"]) ||
    "Groupe non défini"
  );
}

function getEmail(row: EmployeeRow) {
  const utilisateur = getNested(row, "utilisateur");

  return (
    getString(row, ["email", "utilisateur_email", "user_email"]) ||
    (utilisateur ? getString(utilisateur, ["email"]) : "") ||
    "-"
  );
}

function getSexe(row: EmployeeRow) {
  return getString(row, ["sexe"]) || "-";
}

function yesNo(value: boolean) {
  return value ? "Oui" : "Non";
}

function EmployeeCard({ employee }: { employee: EmployeeRow }) {
  const fixedControl = getBoolean(employee, [
    "controle_fixe",
    "is_control",
    "is_main_control",
  ]);
  const nightAuthorized = getBoolean(employee, [
    "travail_nuit_autorise",
    "can_work_night",
    "nuit_autorisee",
  ]);

  return (
    <article className="border border-[rgba(172,189,197,0.15)] bg-[#38474e] p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-[#e1e3e4]">
            {getEmployeeName(employee) || "Employé non défini"}
          </h2>
          <p className="mt-1 text-sm text-[#acbdc5]">{getEmail(employee)}</p>
        </div>
        <span className="w-fit border border-[rgba(172,189,197,0.15)] px-2 py-1 text-xs font-semibold text-[#acbdc5]">
          {getGroupName(employee)}
        </span>
      </div>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-[#acbdc5]">
            Sexe
          </dt>
          <dd className="mt-1 text-[#e1e3e4]">{getSexe(employee)}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-[#acbdc5]">
            Contrôle fixe
          </dt>
          <dd className="mt-1 text-[#e1e3e4]">{yesNo(fixedControl)}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-[#acbdc5]">
            Nuit autorisée
          </dt>
          <dd className="mt-1 text-[#e1e3e4]">{yesNo(nightAuthorized)}</dd>
        </div>
      </dl>
    </article>
  );
}

export default function AdminEmployesPage() {
  const router = useRouter();
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("keepSignedIn");
    router.push("/");
  }

  useEffect(() => {
    const token = localStorage.getItem("token");

    if (!token) {
      router.push("/");
      return;
    }

    const authToken = token;
    let isActive = true;

    async function fetchEmployees() {
      setIsLoading(true);
      setError("");

      try {
        const response = await fetch("http://localhost:5000/api/employes", {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });
        const data = await response.json();

        if (!isActive) {
          return;
        }

        if (!response.ok) {
          setError(data?.message || "Impossible de charger les employés.");
          setEmployees([]);
          return;
        }

        setEmployees(Array.isArray(data) ? data : []);
      } catch {
        if (isActive) {
          setError("Impossible de contacter le serveur backend.");
          setEmployees([]);
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    fetchEmployees();

    return () => {
      isActive = false;
    };
  }, [router]);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#4c595f] text-[#e1e3e4]">
      <header className="border-b border-[rgba(172,189,197,0.15)] bg-[#38474e]">
        <nav className="mx-auto flex min-h-[78px] w-full max-w-[1180px] flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="flex items-center gap-3">
              <Image
                src="/logo.webp"
                alt="Gare Routière de Taza"
                width={48}
                height={48}
                priority
                className="h-12 w-12 object-contain"
              />
              <span className="hidden text-sm font-semibold text-[#e1e3e4] sm:block">
                Gare Routière de Taza
              </span>
            </Link>

            <div className="flex items-center gap-1">
              <Link
                href="/admin"
                className="border-b-2 border-transparent px-3 py-2 text-sm font-semibold text-[#acbdc5] transition hover:text-[#e1e3e4]"
              >
                Accueil
              </Link>
              <Link
                href="/admin/planning"
                className="border-b-2 border-transparent px-3 py-2 text-sm font-semibold text-[#acbdc5] transition hover:text-[#e1e3e4]"
              >
                Planning
              </Link>
              <Link
                href="/admin/employes"
                className="border-b-2 border-[#1AB6FF] px-3 py-2 text-sm font-semibold text-[#e1e3e4]"
              >
                Employés
              </Link>
              <Link
                href="/admin/repos"
                className="border-b-2 border-transparent px-3 py-2 text-sm font-semibold text-[#acbdc5] transition hover:text-[#e1e3e4]"
              >
                Repos
              </Link>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-[#e1e3e4]">Admin</span>
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
            Gestion des employés
          </h1>
          <p className="mt-2 text-sm text-[#acbdc5]">
            Liste des employés de la Gare Routière de Taza
          </p>
        </div>

        {isLoading ? (
          <p className="border border-[rgba(172,189,197,0.15)] bg-[#38474e] px-4 py-5 text-sm text-[#acbdc5]">
            Chargement des employés...
          </p>
        ) : error ? (
          <p className="border border-red-300/30 bg-red-500/10 px-4 py-5 text-sm text-red-100">
            {error}
          </p>
        ) : employees.length === 0 ? (
          <p className="border border-[rgba(172,189,197,0.15)] bg-[#38474e] px-4 py-5 text-sm text-[#acbdc5]">
            Aucun employé trouvé.
          </p>
        ) : (
          <div className="grid gap-4">
            {employees.map((employee, index) => (
              <EmployeeCard
                key={employee.id || `employee-${index}`}
                employee={employee}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
