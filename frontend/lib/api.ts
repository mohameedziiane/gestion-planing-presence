export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

type ApiFetchOptions = RequestInit & {
  token?: string | null;
};

const MESSAGE_TRANSLATIONS: Record<string, string> = {
  "Access denied": "Accès refusé.",
  "A planning row already exists for this employee, date and period":
    "Une ligne de planning existe déjà pour cet employé, cette date et cette période.",
  "A presence record already exists for this employee and date":
    "Une présence existe déjà pour cet employé et cette date.",
  "A repos row already exists for this employee and date":
    "Un repos existe déjà pour cet employé et cette date.",
  "Attendance marked successfully": "Présence pointée avec succès.",
  "Authentication failed": "L'authentification a échoué.",
  "Authentication required": "Authentification requise.",
  "Conge request not found": "Demande de congé introuvable.",
  "Employee account is not linked to an employee record":
    "Le compte employé n'est pas lié à une fiche employé.",
  "Employee is marked as repos today": "L'employé est marqué en repos aujourd'hui.",
  "Employee is on repos today": "L'employé est en repos aujourd'hui.",
  "Employee not found": "Employé introuvable.",
  "Admin account was not found": "Compte administrateur introuvable.",
  "Conversation not found": "Conversation introuvable.",
  "Employees can only access their own data":
    "Les employés ne peuvent accéder qu'à leurs propres données.",
  "Employees can only access their own messages":
    "Les employés ne peuvent accéder qu'à leurs propres messages.",
  "Employees can only access their own planning":
    "Les employés ne peuvent accéder qu'à leur propre planning.",
  "Employees can only access their own presence":
    "Les employés ne peuvent accéder qu'à leur propre présence.",
  "Employees can only access their own repos":
    "Les employés ne peuvent accéder qu'à leurs propres repos.",
  "Email and password are required": "L'email et le mot de passe sont obligatoires.",
  "Email already exists.": "Cet email existe déjà.",
  "Failed to accept conge request": "Impossible d'accepter la demande de congé.",
  "Failed to apply medical deduction": "Impossible d'appliquer la déduction médicale.",
  "Failed to create conge request": "Impossible de créer la demande de congé.",
  "Failed to create conversation": "Impossible de créer la conversation.",
  "Failed to create employee": "Impossible de créer l'employé.",
  "Failed to create medical certificate": "Impossible de créer le certificat médical.",
  "Failed to create planning row": "Impossible de créer la ligne de planning.",
  "Failed to create presence record": "Impossible de créer la présence.",
  "Failed to create repos row": "Impossible de créer la ligne de repos.",
  "Failed to deactivate employee": "Impossible de désactiver l'employé.",
  "Failed to delete planning row": "Impossible de supprimer la ligne de planning.",
  "Failed to delete presence record": "Impossible de supprimer la présence.",
  "Failed to delete repos row": "Impossible de supprimer la ligne de repos.",
  "Failed to detect absences": "Impossible de détecter les absences.",
  "Failed to export planning Excel": "Impossible d'exporter le planning Excel.",
  "Failed to fetch absences": "Impossible de charger les absences.",
  "Failed to fetch admin conge requests":
    "Impossible de charger les demandes de congé administrateur.",
  "Failed to fetch admin medical certificates":
    "Impossible de charger les certificats médicaux administrateur.",
  "Failed to fetch conge requests": "Impossible de charger les demandes de congé.",
  "Failed to fetch conge summary": "Impossible de charger le résumé des congés.",
  "Failed to fetch daily statistics": "Impossible de charger les statistiques du jour.",
  "Failed to fetch directeur dashboard":
    "Impossible de charger le tableau de bord directeur.",
  "Failed to fetch conversations": "Impossible de charger les conversations.",
  "Failed to fetch employee": "Impossible de charger l'employé.",
  "Failed to fetch employee absences": "Impossible de charger les absences de l'employé.",
  "Failed to fetch employees": "Impossible de charger les employés.",
  "Failed to fetch groupes": "Impossible de charger les groupes.",
  "Failed to fetch medical certificates": "Impossible de charger les certificats médicaux.",
  "Failed to fetch medical deductions": "Impossible de charger les déductions médicales.",
  "Failed to fetch overview statistics":
    "Impossible de charger les statistiques générales.",
  "Failed to fetch periodes_travail": "Impossible de charger les périodes de travail.",
  "Failed to fetch planning": "Impossible de charger le planning.",
  "Failed to fetch planning for date": "Impossible de charger le planning de cette date.",
  "Failed to fetch planning for employee":
    "Impossible de charger le planning de cet employé.",
  "Failed to fetch planning row": "Impossible de charger la ligne de planning.",
  "Failed to fetch planning statistics":
    "Impossible de charger les statistiques du planning.",
  "Failed to fetch presence record": "Impossible de charger la présence.",
  "Failed to fetch presence records": "Impossible de charger les présences.",
  "Failed to fetch presence records for date":
    "Impossible de charger les présences de cette date.",
  "Failed to fetch presence records for employee":
    "Impossible de charger les présences de cet employé.",
  "Failed to fetch presence statistics":
    "Impossible de charger les statistiques de présence.",
  "Failed to fetch reference data": "Impossible de charger les données de référence.",
  "Failed to fetch repos": "Impossible de charger les repos.",
  "Failed to fetch repos for date": "Impossible de charger les repos de cette date.",
  "Failed to fetch repos for employee": "Impossible de charger les repos de cet employé.",
  "Failed to fetch repos row": "Impossible de charger la ligne de repos.",
  "Failed to fetch repos statistics": "Impossible de charger les statistiques des repos.",
  "Failed to fetch messages": "Impossible de charger les messages.",
  "Failed to fetch unread messages count":
    "Impossible de charger le nombre de messages non lus.",
  "Failed to fetch notifications": "Impossible de charger les notifications.",
  "Failed to fetch roles": "Impossible de charger les rôles.",
  "Failed to fetch roles_travail": "Impossible de charger les rôles de travail.",
  "Failed to generate weekly planning": "Impossible de générer le planning hebdomadaire.",
  "Failed to mark conversation as read":
    "Impossible de marquer la conversation comme lue.",
  "Failed to mark notification as read":
    "Impossible de marquer la notification comme lue.",
  "Failed to mark notifications as read":
    "Impossible de marquer les notifications comme lues.",
  "Failed to mark attendance": "Impossible de pointer la présence.",
  "Failed to refuse conge request": "Impossible de refuser la demande de congé.",
  "Failed to refuse medical certificate": "Impossible de refuser le certificat médical.",
  "Failed to synchronize absences": "Impossible de synchroniser les absences.",
  "Failed to send message": "Impossible d'envoyer le message.",
  "Failed to update employee": "Impossible de mettre à jour l'employé.",
  "Failed to update planning row": "Impossible de mettre à jour la ligne de planning.",
  "Failed to update presence record": "Impossible de mettre à jour la présence.",
  "Failed to update repos row": "Impossible de mettre à jour la ligne de repos.",
  "Failed to validate medical certificate": "Impossible de valider le certificat médical.",
  "Failed to validate planning": "Impossible de valider le planning.",
  "Invalid certificate id": "Identifiant du certificat invalide.",
  "Invalid conge request id": "Identifiant de demande de congé invalide.",
  "Invalid conversation id": "Identifiant de conversation invalide.",
  "Invalid notification id": "Identifiant de notification invalide.",
  "Invalid credentials": "Identifiants invalides.",
  "Invalid employee creation payload": "Données de création de l'employé invalides.",
  "Invalid employee id": "Identifiant employé invalide.",
  "Invalid employee planning configuration.":
    "Configuration de planning des employés invalide.",
  "Invalid JSON body": "Corps JSON invalide.",
  "Invalid planning id": "Identifiant de planning invalide.",
  "Invalid presence id": "Identifiant de présence invalide.",
  "Invalid repos id": "Identifiant de repos invalide.",
  "Invalid statut filter": "Filtre de statut invalide.",
  "Insufficient remaining annual conge balance": "Solde annuel de congé insuffisant.",
  "Login failed": "Connexion échouée.",
  "Medical certificate not found": "Certificat médical introuvable.",
  "Message content is required": "Le contenu du message est obligatoire.",
  "Message content is too long": "Le contenu du message est trop long.",
  "Missing or invalid authorization header":
    "En-tête d'autorisation manquant ou invalide.",
  "No device tokens found for this user":
    "Aucun jeton d'appareil trouvé pour cet utilisateur.",
  "No planning found for today": "Aucun planning trouvé pour aujourd'hui.",
  "Only employees can access their own absences":
    "Seuls les employés peuvent accéder à leurs propres absences.",
  "Only employees can access this certificate endpoint":
    "Seuls les employés peuvent accéder à cet endpoint de certificats.",
  "Only employees can access this conge endpoint":
    "Seuls les employés peuvent accéder à cet endpoint de congés.",
  "Only employees can use pointage": "Seuls les employés peuvent utiliser le pointage.",
  "Only pending conge requests can be accepted":
    "Seules les demandes de congé en attente peuvent être acceptées.",
  "Only pending conge requests can be refused":
    "Seules les demandes de congé en attente peuvent être refusées.",
  "Only pending medical certificates can be refused":
    "Seuls les certificats médicaux en attente peuvent être refusés.",
  "Only pending medical certificates can be validated":
    "Seuls les certificats médicaux en attente peuvent être validés.",
  "Planning or repos already exist for the requested week. Use overwrite=true to regenerate it.":
    "Un planning ou des repos existent déjà pour la semaine demandée. Utilisez overwrite=true pour régénérer.",
  "Passwords are still stored in plain text. Run the password hashing script before using login.":
    "Les mots de passe sont encore stockés en clair. Exécutez le script de hachage avant d'utiliser la connexion.",
  "Planning row not found": "Ligne de planning introuvable.",
  "Presence already recorded for today": "La présence est déjà enregistrée aujourd'hui.",
  "Presence record not found": "Présence introuvable.",
  "Repos row not found": "Ligne de repos introuvable.",
  "Requested conge days exceed remaining annual balance":
    "Les jours de congé demandés dépassent le solde annuel restant.",
  "Required groups Groupe A and Groupe B were not found. Fallback names Groupe 1 and Groupe 2 are also supported.":
    "Les groupes requis Groupe A et Groupe B sont introuvables. Les noms de secours Groupe 1 et Groupe 2 sont aussi pris en charge.",
  "Required work periods Matin, Soir and Nuit were not found":
    "Les périodes de travail requises Matin, Soir et Nuit sont introuvables.",
  "Required work roles Guichet and Contrôle were not found. Controle without accent is also supported.":
    "Les rôles de travail requis Guichet et Contrôle sont introuvables. Controle sans accent est aussi pris en charge.",
  "Route not found": "Route introuvable.",
  "User not found": "Utilisateur introuvable.",
  "Invalid or expired token": "Jeton invalide ou expiré.",
  "date must be a valid date in YYYY-MM-DD format":
    "La date doit être valide au format AAAA-MM-JJ.",
  "employe_id does not exist": "L'employé sélectionné n'existe pas.",
  "email already exists": "Cet email existe déjà.",
  "groupe_id does not exist": "Le groupe sélectionné n'existe pas.",
  "controle_periode does not exist in periodes_travail":
    "La période de contrôle n'existe pas dans les périodes de travail.",
  "data must be an object when provided": "Les données doivent être un objet quand elles sont fournies.",
  "date_debut must be before or equal to date_fin":
    "La date de début doit être antérieure ou égale à la date de fin.",
  "date_debut_absence must be before or equal to date_fin_absence":
    "La date de début d'absence doit être antérieure ou égale à la date de fin d'absence.",
  "date_debut and date_fin must be valid dates in YYYY-MM-DD format":
    "La date de début et la date de fin doivent être valides au format AAAA-MM-JJ.",
  "date_debut_absence and date_fin_absence must be valid dates in YYYY-MM-DD format":
    "La date de début d'absence et la date de fin d'absence doivent être valides au format AAAA-MM-JJ.",
  "periode_id does not exist": "La période sélectionnée n'existe pas.",
  "overwrite must be a boolean value": "overwrite doit être une valeur booléenne.",
  "role_travail_id does not exist": "Le rôle de travail sélectionné n'existe pas.",
  "title and body are required": "Le titre et le contenu sont obligatoires.",
  "type_conge must be Annuel or Exceptionnel":
    "Le type de congé doit être Annuel ou Exceptionnel.",
  "utilisateur_id must be a valid positive integer":
    "utilisateur_id doit être un entier positif valide.",
  "startDate must be a Monday": "La date de début doit être un lundi.",
  "startDate must be a valid date in YYYY-MM-DD format":
    "La date de début doit être valide au format AAAA-MM-JJ.",
  "token is required": "Le jeton est obligatoire.",
  "weekNumber must be a valid positive integer":
    "Le numéro de semaine doit être un entier positif valide.",
};

const MESSAGE_PATTERNS: Array<[RegExp, (...matches: string[]) => string]> = [
  [
    /^Invalid employee planning configuration\. (.+)$/i,
    (details) =>
      `Configuration de planning des employés invalide. ${translateUserMessages(
        details.split(" | ")
      ).join(" | ")}`,
  ],
  [
    /^Configuration de planning des employés invalide\. (.+)$/i,
    (details) =>
      `Configuration de planning des employés invalide. ${translateUserMessages(
        details.split(" | ")
      ).join(" | ")}`,
  ],
  [
    /^At least 2 active night-capable male employees are required, found (\d+)\.$/i,
    (count) =>
      `Au moins 2 employés hommes actifs autorisés à travailler la nuit sont requis. Trouvé : ${count}.`,
  ],
  [
    /^At least 2 active night-capable employees are required\. Found (\d+)\. Employees must have actif = true, travail_nuit_autorise = true, controle_fixe = false, sexe = 'Homme' and ordre_nuit set\.$/i,
    (count) =>
      `Au moins 2 employés actifs autorisés à travailler la nuit sont requis. Trouvé : ${count}. Les employés doivent avoir actif = true, travail_nuit_autorise = true, controle_fixe = false, sexe = 'Homme' et ordre_nuit renseigné.`,
  ],
  [
    /^Exactly one active Matin fixed control is required, found (\d+)\.$/i,
    (count) => `Un seul contrôleur fixe actif Matin est requis. Trouvé : ${count}.`,
  ],
  [
    /^Exactly one active Soir fixed control is required, found (\d+)\.$/i,
    (count) => `Un seul contrôleur fixe actif Soir est requis. Trouvé : ${count}.`,
  ],
  [
    /^Employee (.+) has invalid repos_base_target '(.+)'\.$/i,
    (name, value) => `L'employé ${name} a une valeur repos_base_target invalide : '${value}'.`,
  ],
  [
    /^Employee (.+) is missing repos_base_target\.$/i,
    (name) => `L'employé ${name} n'a pas de repos_base_target.`,
  ],
  [
    /^Female employee (.+) cannot be authorized for night work\.$/i,
    (name) => `L'employée ${name} ne peut pas être autorisée à travailler la nuit.`,
  ],
  [
    /^Fixed control (.+) cannot be authorized for night work\.$/i,
    (name) => `Le contrôleur fixe ${name} ne peut pas être autorisé à travailler la nuit.`,
  ],
  [
    /^Fixed control (.+) must have controle_periode 'Matin' or 'Soir'\.$/i,
    (name) => `Le contrôleur fixe ${name} doit avoir controle_periode 'Matin' ou 'Soir'.`,
  ],
  [
    /^Employee (.+) has controle_periode set but is not a fixed control\.$/i,
    (name) =>
      `L'employé ${name} a controle_periode renseigné, mais n'est pas un contrôleur fixe.`,
  ],
  [
    /^Employee (.+) has ordre_nuit set but is not authorized for night work\.$/i,
    (name) =>
      `L'employé ${name} a ordre_nuit renseigné, mais n'est pas autorisé à travailler la nuit.`,
  ],
  [
    /^Night-capable employee (.+) must have ordre_nuit set\.$/i,
    (name) =>
      `L'employé ${name} autorisé à travailler la nuit doit avoir ordre_nuit renseigné.`,
  ],
  [
    /^Duplicate ordre_nuit (\d+) found for (.+) and (.+)\.$/i,
    (order, firstName, secondName) =>
      `Ordre nuit ${order} en double pour ${firstName} et ${secondName}.`,
  ],
  [
    /^No periodes_travail row was found for controle_periode '(.+)'\.$/i,
    (period) =>
      `Aucune période de travail trouvée pour controle_periode '${period}'.`,
  ],
  [
    /^(.+) is required$/i,
    (fieldName) => `${fieldName} est obligatoire.`,
  ],
  [
    /^(.+) must be a valid positive integer$/i,
    (fieldName) => `${fieldName} doit être un entier positif valide.`,
  ],
  [
    /^(.+) must be a valid date in YYYY-MM-DD format$/i,
    (fieldName) => `${fieldName} doit être une date valide au format AAAA-MM-JJ.`,
  ],
  [
    /^(.+) must be in HH:MM or HH:MM:SS format$/i,
    (fieldName) => `${fieldName} doit être au format HH:MM ou HH:MM:SS.`,
  ],
  [
    /^(.+) must be one of: (.+)$/i,
    (fieldName, values) => `${fieldName} doit être l'une des valeurs suivantes : ${values}.`,
  ],
  [
    /^(.+) must be 500 characters or fewer$/i,
    (fieldName) => `${fieldName} doit contenir 500 caractères ou moins.`,
  ],
  [
    /^(.+) cannot exceed total absence days$/i,
    (fieldName) => `${fieldName} ne peut pas dépasser le nombre total de jours d'absence.`,
  ],
  [
    /^Invalid weekNumber\. For startDate (.+), expected weekNumber is (.+)\.$/i,
    (startDate, weekNumber) =>
      `Numéro de semaine invalide. Pour la date de début ${startDate}, le numéro attendu est ${weekNumber}.`,
  ],
  [
    /^(.+) Nuit: (.+) is not configured as an active night-capable employee\.$/i,
    (date, name) =>
      `${date} Nuit : ${name} n'est pas configuré comme employé actif autorisé à travailler la nuit.`,
  ],
];

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

function getStoredToken() {
  if (typeof window === "undefined") {
    return null;
  }

  return localStorage.getItem("token");
}

function buildUrl(path: string) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

async function parseResponse(response: Response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function getErrorMessage(payload: unknown, fallback: string) {
  if (
    payload &&
    typeof payload === "object" &&
    "message" in payload &&
    typeof payload.message === "string"
  ) {
    return translateUserMessage(payload.message);
  }

  return translateUserMessage(fallback);
}

export function translateUserMessage(message: string) {
  const normalizedMessage = String(message || "").trim();

  if (!normalizedMessage) {
    return normalizedMessage;
  }

  const exactTranslation = MESSAGE_TRANSLATIONS[normalizedMessage];

  if (exactTranslation) {
    return exactTranslation;
  }

  for (const [pattern, translate] of MESSAGE_PATTERNS) {
    const match = normalizedMessage.match(pattern);

    if (match) {
      return translate(...match.slice(1));
    }
  }

  return normalizedMessage;
}

export function translateUserMessages(messages: unknown[]) {
  return messages.map((message) => translateUserMessage(String(message)));
}

export async function apiFetch<T = unknown>(
  path: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const { token = getStoredToken(), headers, body, ...requestOptions } = options;
  const requestHeaders = new Headers(headers);

  if (token) {
    requestHeaders.set("Authorization", `Bearer ${token}`);
  }

  if (
    body !== undefined &&
    !(body instanceof FormData) &&
    !requestHeaders.has("Content-Type")
  ) {
    requestHeaders.set("Content-Type", "application/json");
  }

  const response = await fetch(buildUrl(path), {
    ...requestOptions,
    body,
    headers: requestHeaders,
  });
  const payload = await parseResponse(response);

  if (!response.ok) {
    throw new ApiError(
      getErrorMessage(payload, "Erreur lors de la requete."),
      response.status,
      payload
    );
  }

  return payload as T;
}
