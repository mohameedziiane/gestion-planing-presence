Gestion du Planning et de Présence 
Gare Routière de Taza 
Type du projet : Application Web de gestion du personnel 
Réalisé par : Sahi Soufyane et Ziane Mohammed 
Encadré par : Ben Rquia Nadia 
Année : 2025 / 2026 
Cahier des Charges 
1.  Présentation générale 
Ce projet consiste à développer une application web dédiée à la gestion du planning et au suivi de la 
présence des employés au sein de la Gare Routière de Taza. 
L'objectif est de digitaliser l'organisation du travail en remplaçant les méthodes manuelles par un système 
fiable, automatisé et sécurisé. 
2.  Objectifs du projet 
• Automatiser la gestion du planning 
• Répartir équitablement les jours de repos 
• Organiser les shifts (Matin / Soir / Nuit) 
• Suivre la présence des employés 
• Réduire les erreurs humaines 
• Améliorer la gestion interne 
3.  Périmètre 
• 10 employés 
• 2 groupes 
Gestion du Planning et de Présence  —2025 / 2026 
• 3 shifts 
• Système de présence sécurisé 
4.  Utilisateurs 
4.1  Administrateur 
• Gestion complète du système 
• Création et modification du planning 
4.2  Employé 
• Consultation du planning 
• Enregistrement de présence 
4.3  Directeur 
• Consultation uniquement (lecture seule) 
• Accès aux plannings et statistiques 
5.  Organisation des employés 
Groupe 1 
• Employée (Guichet ou Caisse) 
• Employée (Guichet ou Caisse) 
• Employé (Contrôle - Fixe) 
• Employé (Guichet/Caisse, peut assurer le Contrôle en cas de repos du contrôle principal) [1] 
• Employé (Guichet/Caisse, peut assurer le Contrôle en cas de repos du contrôle principal) [2] 
Groupe 2 
• Employée (Guichet ou Caisse) 
• Employée (Guichet ou Caisse) 
• Employée (Guichet ou Caisse) 
• Employé (Contrôle - Fixe) 
• Employé (Guichet/Caisse, peut assurer le Contrôle en cas de repos du contrôle principal) [3] 
6.  Gestion des shifts 
Matin 
• 3 à 4 employés 
Gestion du Planning et de Présence  —2025 / 2026 
• Contrôle obligatoire 
Soir 
• Même organisation que le Matin 
Nuit 
• 1 seul employé 
• Aucun contrôle 
• Rotation autorisée 
7.  Règles de rotation 
Groupes 
• Alternance hebdomadaire Matin ⇄ Soir 
Nuit 
• Ordre fixe : 
Employé 1 → Employé 2 → Employé 3 → répétition 
8.  Gestion des repos 
• 6 jours par mois 
• Répartition : 
◦ 2 jours / semaine 
◦ 1 jour / semaine suivante 
• Attribution automatique 
9.  Règles du contrôle 
• Contrôle principal par groupe 
• En cas de repos du contrôle principal : remplacement par un employé masculin du même groupe 
10.  Contraintes 
• Minimum 3 employés par shift 
• 1 seul employé en nuit 
• Respect des repos 
• Gestion des conflits 
Gestion du Planning et de Présence  —2025 / 2026 
11.  Système de présence 
• Pointage via WiFi local 
• Bouton visible uniquement au sein du réseau local 
• Vérification via IP 
Statuts 
• Présent 
• Absent 
• Repos 
12.  Fonctionnalités 
Administrateur 
• Générer planning 
• Modifier planning 
• Gérer employés 
• Suivre présence 
• Voir alertes 
Employé 
• Voir planning 
• Voir repos 
• Pointer présence 
Directeur 
• Voir planning global 
• Voir présence 
• Voir statistiques 
13.  Interfaces 
• Login 
• Dashboard Admin 
• Dashboard Employé 
• Dashboard Directeur 
• Planning 
• Pointage 
Gestion du Planning et de Présence  —2025 / 2026 
14.  Alertes 
• Manque d'employés 
• Absence de contrôle 
• Conflits planning 
• Non-respect des règles 
15.  Spécifications techniques 
• Frontend : Next.js 
• Backend : Node.js (Express) 
• Base de données : MySQL 
• Authentification : JWT 
16.  Base de données 
Tables : 
• utilisateurs 
• roles 
• employes 
• groupes 
• periodes_travail 
• roles_travail 
• planning 
• repos 
• presence 
17.  Infrastructure 
• Hébergement Node.js 
• Base MySQL 
• WiFi interne 
• Vérification IP 
18.  Sécurité 
• Authentification sécurisée 
Gestion du Planning et de Présence  —2025 / 2026 
• Gestion des rôles 
• Protection des données 
Gestion du Planning et de Présence  —2025 / 2026 