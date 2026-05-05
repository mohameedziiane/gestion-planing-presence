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
type EditEmployeeForm = {
  sexe: "Homme" | "Femme";
  groupe_id: number;
  actif: boolean;
  repos_base_target: "1j" | "2j";
  travail_nuit_autorise: boolean;
  ordre_nuit: string;
  controle: "Aucun" | "Matin" | "Soir";
};
type CreateEmployeeForm = EditEmployeeForm & {
  prenom: string;
  nom: string;
  email: string;
  mot_de_passe: string;
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

function getNumber(row: NestedRecord, keys: string[]) {
  for (const key of keys) {
    const value = row[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim()) {
      const numericValue = Number(value);

      if (Number.isFinite(numericValue)) {
        return numericValue;
      }
    }
  }

  return null;
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

function getGroupId(row: EmployeeRow) {
  const directGroupId = getNumber(row, ["groupe_id", "group_id"]);

  if (directGroupId) {
    return directGroupId;
  }

  const groupName = getGroupName(row).toLowerCase();

  if (groupName.includes("groupe a") || groupName.includes("groupe 1")) {
    return 1;
  }

  if (groupName.includes("groupe b") || groupName.includes("groupe 2")) {
    return 2;
  }

  return 1;
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

function isEmployeeActive(row: EmployeeRow) {
  return getBoolean(row, ["actif", "active", "is_active"]);
}

function getReposBaseTarget(row: EmployeeRow) {
  const value = getString(row, ["repos_base_target"]);

  return value === "2j" ? "2j" : "1j";
}

function getOrdreNuit(row: EmployeeRow) {
  const value = getNumber(row, ["ordre_nuit"]);

  return value ? String(value) : "";
}

function getControlValue(row: EmployeeRow) {
  const fixedControl = getBoolean(employeeLike(row), [
    "controle_fixe",
    "is_control",
    "is_main_control",
  ]);
  const controlPeriod = getString(row, ["controle_periode"]);

  if (!fixedControl) {
    return "Aucun";
  }

  return controlPeriod === "Soir" ? "Soir" : "Matin";
}

function getFixedControlLabel(row: EmployeeRow) {
  const controlValue = getControlValue(row);

  return controlValue === "Aucun" ? "Contrôle: Non" : `Contrôle: ${controlValue}`;
}

function employeeLike(row: EmployeeRow) {
  return row as NestedRecord;
}

function buildInitialForm(employee: EmployeeRow): EditEmployeeForm {
  const sexe = getSexe(employee) === "Femme" ? "Femme" : "Homme";
  const controle = getControlValue(employee);
  const nightAuthorized =
    sexe === "Homme" &&
    controle === "Aucun" &&
    getBoolean(employee, [
      "travail_nuit_autorise",
      "can_work_night",
      "nuit_autorisee",
    ]);

  return {
    sexe,
    groupe_id: getGroupId(employee),
    actif: getBoolean(employee, ["actif", "active", "is_active"]),
    repos_base_target: getReposBaseTarget(employee),
    travail_nuit_autorise: nightAuthorized,
    ordre_nuit: nightAuthorized ? getOrdreNuit(employee) : "",
    controle,
  };
}

function normalizeForm(form: EditEmployeeForm): EditEmployeeForm {
  const nextForm = { ...form };

  if (nextForm.sexe === "Femme" || nextForm.controle !== "Aucun") {
    nextForm.travail_nuit_autorise = false;
    nextForm.ordre_nuit = "";
  }

  if (!nextForm.travail_nuit_autorise) {
    nextForm.ordre_nuit = "";
  }

  return nextForm;
}

function buildDefaultCreateForm(): CreateEmployeeForm {
  return {
    prenom: "",
    nom: "",
    email: "",
    mot_de_passe: "123456",
    sexe: "Homme",
    groupe_id: 1,
    actif: true,
    repos_base_target: "1j",
    travail_nuit_autorise: false,
    ordre_nuit: "",
    controle: "Aucun",
  };
}

function normalizeCreateForm(form: CreateEmployeeForm): CreateEmployeeForm {
  return {
    ...form,
    ...normalizeForm(form),
  };
}

function yesNo(value: boolean) {
  return value ? "Oui" : "Non";
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[3px] border border-[rgba(172,189,197,0.15)] bg-[#38474e] px-4 py-3">
      <p className="text-xs font-semibold uppercase text-[#acbdc5]">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold text-[#e1e3e4]">{value}</p>
    </div>
  );
}

function EmployeeCard({
  employee,
  onEdit,
  onDeactivate,
}: {
  employee: EmployeeRow;
  onEdit: (employee: EmployeeRow) => void;
  onDeactivate: (employee: EmployeeRow) => void;
}) {
  const active = isEmployeeActive(employee);
  const nightAuthorized = getBoolean(employee, [
    "travail_nuit_autorise",
    "can_work_night",
    "nuit_autorisee",
  ]);
  const ordreNuit = getOrdreNuit(employee);

  return (
    <article className="rounded-[3px] border border-[rgba(172,189,197,0.15)] bg-[#38474e] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-[#e1e3e4]">
            {getEmployeeName(employee) || "Employé non défini"}
          </h2>
          <p className="mt-1 truncate text-sm text-[#acbdc5]">
            {getEmail(employee)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!active ? (
            <span className="w-fit rounded-[3px] border border-[rgba(172,189,197,0.25)] bg-[#334149] px-2 py-1 text-xs font-semibold text-[#acbdc5]">
              Inactif
            </span>
          ) : null}
          <span className="w-fit rounded-[3px] border border-[rgba(172,189,197,0.15)] px-2 py-1 text-xs font-semibold text-[#acbdc5]">
            {getGroupName(employee)}
          </span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-[#e1e3e4]">
        <span className="rounded-[3px] border border-[rgba(172,189,197,0.15)] bg-[#334149] px-2.5 py-1.5">
          Sexe: {getSexe(employee)}
        </span>
        <span className="rounded-[3px] border border-[rgba(172,189,197,0.15)] bg-[#334149] px-2.5 py-1.5">
          {getFixedControlLabel(employee)}
        </span>
        <span className="rounded-[3px] border border-[rgba(172,189,197,0.15)] bg-[#334149] px-2.5 py-1.5">
          Nuit: {yesNo(nightAuthorized)}
        </span>
        {ordreNuit ? (
          <span className="rounded-[3px] border border-[rgba(172,189,197,0.15)] bg-[#334149] px-2.5 py-1.5">
            Ordre nuit: {ordreNuit}
          </span>
        ) : null}
        <span className="rounded-[3px] border border-[rgba(172,189,197,0.15)] bg-[#334149] px-2.5 py-1.5">
          Repos base: {getReposBaseTarget(employee)}
        </span>
      </div>

      <div className="mt-4 flex flex-col gap-2 border-t border-[rgba(172,189,197,0.12)] pt-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={() => onEdit(employee)}
          className="rounded-[3px] border border-[#1AB6FF]/60 px-3 py-1.5 text-sm font-semibold text-[#e1e3e4] transition hover:bg-[#1AB6FF] hover:text-[#102029]"
        >
          Modifier
        </button>
        {active ? (
          <button
            type="button"
            onClick={() => onDeactivate(employee)}
            className="rounded-[3px] border border-red-400/35 bg-red-950/20 px-3 py-1.5 text-sm font-semibold text-red-200 transition hover:border-red-300/60 hover:bg-red-900/35 hover:text-red-100"
          >
            Désactiver
          </button>
        ) : null}
      </div>
    </article>
  );
}

export default function AdminEmployesPage() {
  const router = useRouter();
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [editingEmployee, setEditingEmployee] = useState<EmployeeRow | null>(
    null
  );
  const [editForm, setEditForm] = useState<EditEmployeeForm | null>(null);
  const [editError, setEditError] = useState("");
  const [editErrors, setEditErrors] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateEmployeeForm>(
    buildDefaultCreateForm
  );
  const [createError, setCreateError] = useState("");
  const [createErrors, setCreateErrors] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [deactivatingEmployee, setDeactivatingEmployee] =
    useState<EmployeeRow | null>(null);
  const [deactivateError, setDeactivateError] = useState("");
  const [deactivateErrors, setDeactivateErrors] = useState<string[]>([]);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const employeeStats = {
    total: employees.length,
    active: employees.filter(isEmployeeActive).length,
    inactive: employees.filter((employee) => !isEmployeeActive(employee)).length,
    night: employees.filter((employee) =>
      getBoolean(employee, [
        "travail_nuit_autorise",
        "can_work_night",
        "nuit_autorisee",
      ])
    ).length,
    fixedControls: employees.filter((employee) =>
      getBoolean(employee, [
        "controle_fixe",
        "is_control",
        "is_main_control",
      ])
    ).length,
  };

  async function fetchEmployees() {
    const token = localStorage.getItem("token");

    if (!token) {
      router.push("/");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("http://localhost:5000/api/employes", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data?.message || "Impossible de charger les employés.");
        setEmployees([]);
        return;
      }

      setEmployees(Array.isArray(data) ? data : []);
    } catch {
      setError("Impossible de contacter le serveur backend.");
      setEmployees([]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("keepSignedIn");
    router.push("/");
  }

  function openEditModal(employee: EmployeeRow) {
    setEditingEmployee(employee);
    setEditForm(buildInitialForm(employee));
    setEditError("");
    setEditErrors([]);
    setSuccessMessage("");
  }

  function openCreateModal() {
    setCreateForm(buildDefaultCreateForm());
    setCreateError("");
    setCreateErrors([]);
    setSuccessMessage("");
    setIsCreateModalOpen(true);
  }

  function openDeactivateModal(employee: EmployeeRow) {
    setDeactivatingEmployee(employee);
    setDeactivateError("");
    setDeactivateErrors([]);
    setSuccessMessage("");
  }

  function closeDeactivateModal() {
    if (isDeactivating) {
      return;
    }

    setDeactivatingEmployee(null);
    setDeactivateError("");
    setDeactivateErrors([]);
  }

  function closeCreateModal() {
    if (isCreating) {
      return;
    }

    setIsCreateModalOpen(false);
    setCreateError("");
    setCreateErrors([]);
  }

  function closeEditModal() {
    if (isSaving) {
      return;
    }

    setEditingEmployee(null);
    setEditForm(null);
    setEditError("");
    setEditErrors([]);
  }

  function updateEditForm(nextFields: Partial<EditEmployeeForm>) {
    setEditForm((currentForm) =>
      currentForm ? normalizeForm({ ...currentForm, ...nextFields }) : null
    );
    setEditError("");
    setEditErrors([]);
  }

  function updateCreateForm(nextFields: Partial<CreateEmployeeForm>) {
    setCreateForm((currentForm) =>
      normalizeCreateForm({ ...currentForm, ...nextFields })
    );
    setCreateError("");
    setCreateErrors([]);
  }

  async function handleSaveEmployee() {
    if (!editingEmployee || !editForm) {
      return;
    }

    const normalizedForm = normalizeForm(editForm);
    const employeeId = editingEmployee.id;
    const token = localStorage.getItem("token");

    if (!token) {
      router.push("/");
      return;
    }

    if (!employeeId) {
      setEditError("Identifiant employé introuvable.");
      return;
    }

    if (
      normalizedForm.travail_nuit_autorise &&
      normalizedForm.ordre_nuit.trim() === ""
    ) {
      setEditError("Ordre nuit est requis quand la nuit est autorisée.");
      return;
    }

    const payload = {
      sexe: normalizedForm.sexe,
      groupe_id: normalizedForm.groupe_id,
      actif: normalizedForm.actif,
      repos_base_target: normalizedForm.repos_base_target,
      travail_nuit_autorise: normalizedForm.travail_nuit_autorise,
      ordre_nuit: normalizedForm.travail_nuit_autorise
        ? Number(normalizedForm.ordre_nuit)
        : null,
      controle_fixe: normalizedForm.controle !== "Aucun",
      controle_periode:
        normalizedForm.controle === "Aucun" ? null : normalizedForm.controle,
    };

    setIsSaving(true);
    setEditError("");
    setEditErrors([]);

    try {
      const response = await fetch(
        `http://localhost:5000/api/employes/${employeeId}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );
      const data = await response.json();

      if (!response.ok) {
        setEditError(
          data?.message || "Impossible de mettre à jour cet employé."
        );
        setEditErrors(
          Array.isArray(data?.errors)
            ? data.errors.map((item: unknown) => String(item))
            : []
        );
        return;
      }

      setSuccessMessage("Employé mis à jour avec succès.");
      setEditingEmployee(null);
      setEditForm(null);
      await fetchEmployees();
    } catch {
      setEditError("Impossible de contacter le serveur backend.");
      setEditErrors([]);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCreateEmployee() {
    const normalizedForm = normalizeCreateForm(createForm);
    const token = localStorage.getItem("token");

    if (!token) {
      router.push("/");
      return;
    }

    if (
      !normalizedForm.prenom.trim() ||
      !normalizedForm.nom.trim() ||
      !normalizedForm.email.trim() ||
      !normalizedForm.mot_de_passe
    ) {
      setCreateError("Prénom, nom, email et mot de passe sont requis.");
      return;
    }

    if (
      normalizedForm.travail_nuit_autorise &&
      normalizedForm.ordre_nuit.trim() === ""
    ) {
      setCreateError("Ordre nuit est requis quand la nuit est autorisée.");
      return;
    }

    const payload = {
      prenom: normalizedForm.prenom.trim(),
      nom: normalizedForm.nom.trim(),
      email: normalizedForm.email.trim(),
      mot_de_passe: normalizedForm.mot_de_passe,
      sexe: normalizedForm.sexe,
      groupe_id: normalizedForm.groupe_id,
      actif: normalizedForm.actif,
      repos_base_target: normalizedForm.repos_base_target,
      travail_nuit_autorise: normalizedForm.travail_nuit_autorise,
      ordre_nuit: normalizedForm.travail_nuit_autorise
        ? Number(normalizedForm.ordre_nuit)
        : null,
      controle_fixe: normalizedForm.controle !== "Aucun",
      controle_periode:
        normalizedForm.controle === "Aucun" ? null : normalizedForm.controle,
    };

    setIsCreating(true);
    setCreateError("");
    setCreateErrors([]);

    try {
      const response = await fetch("http://localhost:5000/api/employes", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!response.ok) {
        setCreateError(data?.message || "Impossible de créer cet employé.");
        setCreateErrors(
          Array.isArray(data?.errors)
            ? data.errors.map((item: unknown) => String(item))
            : []
        );
        return;
      }

      setSuccessMessage("Employé créé avec succès.");
      setIsCreateModalOpen(false);
      setCreateForm(buildDefaultCreateForm());
      await fetchEmployees();
    } catch {
      setCreateError("Impossible de contacter le serveur backend.");
      setCreateErrors([]);
    } finally {
      setIsCreating(false);
    }
  }

  async function handleDeactivateEmployee() {
    if (!deactivatingEmployee) {
      return;
    }

    const employeeId = deactivatingEmployee.id;
    const token = localStorage.getItem("token");

    if (!token) {
      router.push("/");
      return;
    }

    if (!employeeId) {
      setDeactivateError("Identifiant employé introuvable.");
      return;
    }

    setIsDeactivating(true);
    setDeactivateError("");
    setDeactivateErrors([]);

    try {
      const response = await fetch(
        `http://localhost:5000/api/employes/${employeeId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      const data = await response.json();

      if (!response.ok) {
        setDeactivateError(
          data?.message || "Impossible de désactiver cet employé."
        );
        setDeactivateErrors(
          Array.isArray(data?.errors)
            ? data.errors.map((item: unknown) => String(item))
            : []
        );
        return;
      }

      setSuccessMessage("Employé désactivé avec succès.");
      setDeactivatingEmployee(null);
      await fetchEmployees();
    } catch {
      setDeactivateError("Impossible de contacter le serveur backend.");
      setDeactivateErrors([]);
    } finally {
      setIsDeactivating(false);
    }
  }

  useEffect(() => {
    const token = localStorage.getItem("token");

    if (!token) {
      router.push("/");
      return;
    }

    let isActive = true;

    async function loadEmployees() {
      setIsLoading(true);
      setError("");

      try {
        const response = await fetch("http://localhost:5000/api/employes", {
          headers: {
            Authorization: `Bearer ${token}`,
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

    loadEmployees();

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
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
          <h1 className="text-2xl font-semibold text-[#e1e3e4] sm:text-3xl">
            Gestion des employés
          </h1>
          <p className="mt-2 text-sm text-[#acbdc5]">
            Liste des employés de la Gare Routière de Taza
          </p>
          </div>
          <button
            type="button"
            onClick={openCreateModal}
            className="w-full rounded-[3px] border border-[#1AB6FF] bg-[#1AB6FF] px-4 py-2 text-sm font-semibold text-[#102029] transition hover:border-[#169CDC] hover:bg-[#169CDC] sm:w-auto"
          >
            Ajouter employé
          </button>
        </div>

        {!isLoading && !error ? (
          <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard label="Total employés" value={employeeStats.total} />
            <StatCard label="Actifs" value={employeeStats.active} />
            <StatCard label="Inactifs" value={employeeStats.inactive} />
            <StatCard label="Nuit autorisée" value={employeeStats.night} />
            <StatCard
              label="Contrôles fixes"
              value={employeeStats.fixedControls}
            />
          </div>
        ) : null}

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
          <>
            {successMessage ? (
              <p className="mb-4 border border-[#1AB6FF]/40 bg-[#1AB6FF]/10 px-4 py-3 text-sm font-semibold text-[#e1e3e4]">
                {successMessage}
              </p>
            ) : null}

            <div className="grid gap-4">
              {employees.map((employee, index) => (
                <EmployeeCard
                  key={employee.id || `employee-${index}`}
                  employee={employee}
                  onEdit={openEditModal}
                  onDeactivate={openDeactivateModal}
                />
              ))}
            </div>
          </>
        )}
      </section>

      {isCreateModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 px-3 py-4 sm:items-center">
          <div className="max-h-[92vh] w-full max-w-[620px] overflow-y-auto border border-[rgba(172,189,197,0.15)] bg-[#38474e] p-4 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4 border-b border-[rgba(172,189,197,0.15)] pb-4">
              <div>
                <h2 className="text-xl font-semibold text-[#e1e3e4]">
                  Ajouter employé
                </h2>
                <p className="mt-1 text-sm text-[#acbdc5]">
                  Nouvel employé de la Gare Routière de Taza
                </p>
              </div>
              <button
                type="button"
                onClick={closeCreateModal}
                className="border border-[rgba(172,189,197,0.18)] px-3 py-2 text-sm font-semibold text-[#acbdc5] transition hover:border-[#1AB6FF] hover:text-[#e1e3e4]"
              >
                Fermer
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold text-[#e1e3e4]">
                Prénom
                <input
                  type="text"
                  value={createForm.prenom}
                  onChange={(event) =>
                    updateCreateForm({ prenom: event.target.value })
                  }
                  className="border border-[rgba(172,189,197,0.15)] bg-[#334149] px-3 py-2 text-[#e1e3e4] outline-none focus:border-[#1AB6FF]"
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold text-[#e1e3e4]">
                Nom
                <input
                  type="text"
                  value={createForm.nom}
                  onChange={(event) =>
                    updateCreateForm({ nom: event.target.value })
                  }
                  className="border border-[rgba(172,189,197,0.15)] bg-[#334149] px-3 py-2 text-[#e1e3e4] outline-none focus:border-[#1AB6FF]"
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold text-[#e1e3e4]">
                Email
                <input
                  type="email"
                  value={createForm.email}
                  onChange={(event) =>
                    updateCreateForm({ email: event.target.value })
                  }
                  className="border border-[rgba(172,189,197,0.15)] bg-[#334149] px-3 py-2 text-[#e1e3e4] outline-none focus:border-[#1AB6FF]"
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold text-[#e1e3e4]">
                Mot de passe
                <input
                  type="text"
                  value={createForm.mot_de_passe}
                  onChange={(event) =>
                    updateCreateForm({ mot_de_passe: event.target.value })
                  }
                  className="border border-[rgba(172,189,197,0.15)] bg-[#334149] px-3 py-2 text-[#e1e3e4] outline-none focus:border-[#1AB6FF]"
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold text-[#e1e3e4]">
                Sexe
                <select
                  value={createForm.sexe}
                  onChange={(event) =>
                    updateCreateForm({
                      sexe: event.target.value as "Homme" | "Femme",
                    })
                  }
                  className="border border-[rgba(172,189,197,0.15)] bg-[#334149] px-3 py-2 text-[#e1e3e4] outline-none focus:border-[#1AB6FF]"
                >
                  <option value="Homme">Homme</option>
                  <option value="Femme">Femme</option>
                </select>
              </label>

              <label className="grid gap-2 text-sm font-semibold text-[#e1e3e4]">
                Groupe
                <select
                  value={createForm.groupe_id}
                  onChange={(event) =>
                    updateCreateForm({ groupe_id: Number(event.target.value) })
                  }
                  className="border border-[rgba(172,189,197,0.15)] bg-[#334149] px-3 py-2 text-[#e1e3e4] outline-none focus:border-[#1AB6FF]"
                >
                  <option value={1}>Groupe A</option>
                  <option value={2}>Groupe B</option>
                </select>
              </label>

              <label className="flex items-center justify-between gap-3 border border-[rgba(172,189,197,0.15)] bg-[#334149] px-3 py-3 text-sm font-semibold text-[#e1e3e4]">
                Actif
                <input
                  type="checkbox"
                  checked={createForm.actif}
                  onChange={(event) =>
                    updateCreateForm({ actif: event.target.checked })
                  }
                  className="h-5 w-5 accent-[#1AB6FF]"
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold text-[#e1e3e4]">
                Repos base
                <select
                  value={createForm.repos_base_target}
                  onChange={(event) =>
                    updateCreateForm({
                      repos_base_target: event.target.value as "1j" | "2j",
                    })
                  }
                  className="border border-[rgba(172,189,197,0.15)] bg-[#334149] px-3 py-2 text-[#e1e3e4] outline-none focus:border-[#1AB6FF]"
                >
                  <option value="1j">1j</option>
                  <option value="2j">2j</option>
                </select>
              </label>

              <label className="grid gap-2 text-sm font-semibold text-[#e1e3e4]">
                Contrôle fixe
                <select
                  value={createForm.controle}
                  onChange={(event) =>
                    updateCreateForm({
                      controle: event.target.value as
                        | "Aucun"
                        | "Matin"
                        | "Soir",
                    })
                  }
                  className="border border-[rgba(172,189,197,0.15)] bg-[#334149] px-3 py-2 text-[#e1e3e4] outline-none focus:border-[#1AB6FF]"
                >
                  <option value="Aucun">Aucun</option>
                  <option value="Matin">Matin</option>
                  <option value="Soir">Soir</option>
                </select>
              </label>

              <label className="flex items-center justify-between gap-3 border border-[rgba(172,189,197,0.15)] bg-[#334149] px-3 py-3 text-sm font-semibold text-[#e1e3e4]">
                Peut travailler la nuit
                <input
                  type="checkbox"
                  checked={createForm.travail_nuit_autorise}
                  disabled={
                    createForm.sexe === "Femme" ||
                    createForm.controle !== "Aucun"
                  }
                  onChange={(event) =>
                    updateCreateForm({
                      travail_nuit_autorise: event.target.checked,
                    })
                  }
                  className="h-5 w-5 accent-[#1AB6FF] disabled:opacity-40"
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold text-[#e1e3e4] sm:col-span-2">
                Ordre nuit
                <input
                  type="number"
                  min={1}
                  value={createForm.ordre_nuit}
                  disabled={!createForm.travail_nuit_autorise}
                  required={createForm.travail_nuit_autorise}
                  onChange={(event) =>
                    updateCreateForm({ ordre_nuit: event.target.value })
                  }
                  className="border border-[rgba(172,189,197,0.15)] bg-[#334149] px-3 py-2 text-[#e1e3e4] outline-none focus:border-[#1AB6FF] disabled:cursor-not-allowed disabled:opacity-50"
                />
              </label>
            </div>

            {createError ? (
              <div className="mt-5 border border-red-300/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                <p className="font-semibold">{createError}</p>
                {createErrors.length > 0 ? (
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {createErrors.map((item, index) => (
                      <li key={`${item}-${index}`}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeCreateModal}
                className="border border-[rgba(172,189,197,0.18)] px-4 py-2 text-sm font-semibold text-[#acbdc5] transition hover:border-[#1AB6FF] hover:text-[#e1e3e4]"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleCreateEmployee}
                disabled={isCreating}
                className="border border-[#1AB6FF] bg-[#1AB6FF] px-4 py-2 text-sm font-semibold text-[#102029] transition hover:bg-transparent hover:text-[#e1e3e4] disabled:cursor-wait disabled:opacity-60"
              >
                {isCreating ? "Création..." : "Créer"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deactivatingEmployee ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 px-3 py-4 sm:items-center">
          <div className="max-h-[92vh] w-full max-w-[560px] overflow-y-auto border border-[rgba(172,189,197,0.15)] bg-[#38474e] p-4 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4 border-b border-[rgba(172,189,197,0.15)] pb-4">
              <div>
                <h2 className="text-xl font-semibold text-[#e1e3e4]">
                  Désactiver employé
                </h2>
                <p className="mt-1 text-sm font-semibold text-[#e1e3e4]">
                  {getEmployeeName(deactivatingEmployee) ||
                    "Employé non défini"}
                </p>
              </div>
              <button
                type="button"
                onClick={closeDeactivateModal}
                className="border border-[rgba(172,189,197,0.18)] px-3 py-2 text-sm font-semibold text-[#acbdc5] transition hover:border-[#1AB6FF] hover:text-[#e1e3e4]"
              >
                Fermer
              </button>
            </div>

            <p className="mt-5 text-sm leading-6 text-[#acbdc5]">
              Cet employé ne sera plus inclus dans les prochains plannings,
              mais son historique sera conservé.
            </p>

            {deactivateError ? (
              <div className="mt-5 border border-red-300/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                <p className="font-semibold">{deactivateError}</p>
                {deactivateErrors.length > 0 ? (
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {deactivateErrors.map((item, index) => (
                      <li key={`${item}-${index}`}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeDeactivateModal}
                className="border border-[rgba(172,189,197,0.18)] px-4 py-2 text-sm font-semibold text-[#acbdc5] transition hover:border-[#1AB6FF] hover:text-[#e1e3e4]"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleDeactivateEmployee}
                disabled={isDeactivating}
                className="border border-red-400/45 bg-red-950/30 px-4 py-2 text-sm font-semibold text-red-100 transition hover:border-red-300/70 hover:bg-red-900/45 disabled:cursor-wait disabled:opacity-60"
              >
                {isDeactivating
                  ? "Désactivation..."
                  : "Confirmer la désactivation"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editingEmployee && editForm ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 px-3 py-4 sm:items-center">
          <div className="max-h-[92vh] w-full max-w-[620px] overflow-y-auto border border-[rgba(172,189,197,0.15)] bg-[#38474e] p-4 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4 border-b border-[rgba(172,189,197,0.15)] pb-4">
              <div>
                <h2 className="text-xl font-semibold text-[#e1e3e4]">
                  Modifier employé
                </h2>
                <p className="mt-1 text-sm text-[#acbdc5]">
                  {getEmployeeName(editingEmployee) || "Employé non défini"}
                </p>
              </div>
              <button
                type="button"
                onClick={closeEditModal}
                className="border border-[rgba(172,189,197,0.18)] px-3 py-2 text-sm font-semibold text-[#acbdc5] transition hover:border-[#1AB6FF] hover:text-[#e1e3e4]"
              >
                Fermer
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold text-[#e1e3e4]">
                Sexe
                <select
                  value={editForm.sexe}
                  onChange={(event) =>
                    updateEditForm({
                      sexe: event.target.value as "Homme" | "Femme",
                    })
                  }
                  className="border border-[rgba(172,189,197,0.15)] bg-[#334149] px-3 py-2 text-[#e1e3e4] outline-none focus:border-[#1AB6FF]"
                >
                  <option value="Homme">Homme</option>
                  <option value="Femme">Femme</option>
                </select>
              </label>

              <label className="grid gap-2 text-sm font-semibold text-[#e1e3e4]">
                Groupe
                <select
                  value={editForm.groupe_id}
                  onChange={(event) =>
                    updateEditForm({ groupe_id: Number(event.target.value) })
                  }
                  className="border border-[rgba(172,189,197,0.15)] bg-[#334149] px-3 py-2 text-[#e1e3e4] outline-none focus:border-[#1AB6FF]"
                >
                  <option value={1}>Groupe A</option>
                  <option value={2}>Groupe B</option>
                </select>
              </label>

              <label className="flex items-center justify-between gap-3 border border-[rgba(172,189,197,0.15)] bg-[#334149] px-3 py-3 text-sm font-semibold text-[#e1e3e4]">
                Actif
                <input
                  type="checkbox"
                  checked={editForm.actif}
                  onChange={(event) =>
                    updateEditForm({ actif: event.target.checked })
                  }
                  className="h-5 w-5 accent-[#1AB6FF]"
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold text-[#e1e3e4]">
                Repos base
                <select
                  value={editForm.repos_base_target}
                  onChange={(event) =>
                    updateEditForm({
                      repos_base_target: event.target.value as "1j" | "2j",
                    })
                  }
                  className="border border-[rgba(172,189,197,0.15)] bg-[#334149] px-3 py-2 text-[#e1e3e4] outline-none focus:border-[#1AB6FF]"
                >
                  <option value="1j">1j</option>
                  <option value="2j">2j</option>
                </select>
              </label>

              <label className="grid gap-2 text-sm font-semibold text-[#e1e3e4]">
                Contrôle fixe
                <select
                  value={editForm.controle}
                  onChange={(event) =>
                    updateEditForm({
                      controle: event.target.value as
                        | "Aucun"
                        | "Matin"
                        | "Soir",
                    })
                  }
                  className="border border-[rgba(172,189,197,0.15)] bg-[#334149] px-3 py-2 text-[#e1e3e4] outline-none focus:border-[#1AB6FF]"
                >
                  <option value="Aucun">Aucun</option>
                  <option value="Matin">Matin</option>
                  <option value="Soir">Soir</option>
                </select>
              </label>

              <label className="flex items-center justify-between gap-3 border border-[rgba(172,189,197,0.15)] bg-[#334149] px-3 py-3 text-sm font-semibold text-[#e1e3e4]">
                Peut travailler la nuit
                <input
                  type="checkbox"
                  checked={editForm.travail_nuit_autorise}
                  disabled={
                    editForm.sexe === "Femme" || editForm.controle !== "Aucun"
                  }
                  onChange={(event) =>
                    updateEditForm({
                      travail_nuit_autorise: event.target.checked,
                    })
                  }
                  className="h-5 w-5 accent-[#1AB6FF] disabled:opacity-40"
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold text-[#e1e3e4] sm:col-span-2">
                Ordre nuit
                <input
                  type="number"
                  min={1}
                  value={editForm.ordre_nuit}
                  disabled={!editForm.travail_nuit_autorise}
                  required={editForm.travail_nuit_autorise}
                  onChange={(event) =>
                    updateEditForm({ ordre_nuit: event.target.value })
                  }
                  className="border border-[rgba(172,189,197,0.15)] bg-[#334149] px-3 py-2 text-[#e1e3e4] outline-none focus:border-[#1AB6FF] disabled:cursor-not-allowed disabled:opacity-50"
                />
              </label>
            </div>

            {editError ? (
              <div className="mt-5 border border-red-300/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                <p className="font-semibold">{editError}</p>
                {editErrors.length > 0 ? (
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {editErrors.map((item, index) => (
                      <li key={`${item}-${index}`}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeEditModal}
                className="border border-[rgba(172,189,197,0.18)] px-4 py-2 text-sm font-semibold text-[#acbdc5] transition hover:border-[#1AB6FF] hover:text-[#e1e3e4]"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSaveEmployee}
                disabled={isSaving}
                className="border border-[#1AB6FF] bg-[#1AB6FF] px-4 py-2 text-sm font-semibold text-[#102029] transition hover:bg-transparent hover:text-[#e1e3e4] disabled:cursor-wait disabled:opacity-60"
              >
                {isSaving ? "Enregistrement..." : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
