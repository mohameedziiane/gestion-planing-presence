-- Phase 1: employee planning configuration fields.
-- Safe for existing data: no drops, no deletes, only additive columns and seed updates.
-- Run this script against the project database in MySQL Workbench.

SET @schema_name = DATABASE();

-- Add employes.actif if it does not already exist.
SELECT COUNT(*)
INTO @column_exists
FROM information_schema.columns
WHERE table_schema = @schema_name
  AND table_name = 'employes'
  AND column_name = 'actif';

SET @sql = IF(
  @column_exists = 0,
  'ALTER TABLE employes ADD COLUMN actif BOOLEAN DEFAULT TRUE',
  'SELECT ''Column employes.actif already exists'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add employes.repos_base_target if it does not already exist.
SELECT COUNT(*)
INTO @column_exists
FROM information_schema.columns
WHERE table_schema = @schema_name
  AND table_name = 'employes'
  AND column_name = 'repos_base_target';

SET @sql = IF(
  @column_exists = 0,
  'ALTER TABLE employes ADD COLUMN repos_base_target ENUM(''1j'',''2j'') NULL',
  'SELECT ''Column employes.repos_base_target already exists'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add employes.ordre_nuit if it does not already exist.
SELECT COUNT(*)
INTO @column_exists
FROM information_schema.columns
WHERE table_schema = @schema_name
  AND table_name = 'employes'
  AND column_name = 'ordre_nuit';

SET @sql = IF(
  @column_exists = 0,
  'ALTER TABLE employes ADD COLUMN ordre_nuit INT NULL',
  'SELECT ''Column employes.ordre_nuit already exists'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add employes.controle_periode if it does not already exist.
SELECT COUNT(*)
INTO @column_exists
FROM information_schema.columns
WHERE table_schema = @schema_name
  AND table_name = 'employes'
  AND column_name = 'controle_periode';

SET @sql = IF(
  @column_exists = 0,
  'ALTER TABLE employes ADD COLUMN controle_periode ENUM(''Matin'',''Soir'') NULL',
  'SELECT ''Column employes.controle_periode already exists'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Seed active status for current employees.
UPDATE employes
SET actif = TRUE;

-- Seed repos base targets.
UPDATE employes SET repos_base_target = '1j' WHERE UPPER(TRIM(prenom)) = 'FATIHA';
UPDATE employes SET repos_base_target = '2j' WHERE UPPER(TRIM(prenom)) = 'HAYAT';
UPDATE employes SET repos_base_target = '2j' WHERE UPPER(TRIM(prenom)) = 'MONCEF';
UPDATE employes SET repos_base_target = '1j' WHERE UPPER(TRIM(prenom)) = 'AYOUB';
UPDATE employes SET repos_base_target = '1j' WHERE UPPER(TRIM(prenom)) IN ('YOUNESS', 'YOUNES');
UPDATE employes SET repos_base_target = '1j' WHERE UPPER(TRIM(prenom)) = 'ABIRE';
UPDATE employes SET repos_base_target = '1j' WHERE UPPER(TRIM(prenom)) = 'RAHMA';
UPDATE employes SET repos_base_target = '2j' WHERE UPPER(TRIM(prenom)) = 'SAID';
UPDATE employes SET repos_base_target = '1j' WHERE UPPER(TRIM(prenom)) = 'SABER';
UPDATE employes SET repos_base_target = '2j' WHERE UPPER(TRIM(prenom)) = 'TAHRA';

-- Seed fixed control configuration.
UPDATE employes
SET controle_fixe = TRUE,
    controle_periode = 'Matin',
    travail_nuit_autorise = FALSE
WHERE UPPER(TRIM(prenom)) = 'MONCEF';

UPDATE employes
SET controle_fixe = TRUE,
    controle_periode = 'Soir',
    travail_nuit_autorise = FALSE
WHERE UPPER(TRIM(prenom)) = 'SAID';

-- Keep non-control employees clear for future dynamic control configuration.
UPDATE employes
SET controle_periode = NULL
WHERE UPPER(TRIM(prenom)) NOT IN ('MONCEF', 'SAID');

-- Seed night rotation configuration.
UPDATE employes
SET travail_nuit_autorise = TRUE,
    controle_fixe = FALSE,
    ordre_nuit = 1
WHERE UPPER(TRIM(prenom)) = 'SABER';

UPDATE employes
SET travail_nuit_autorise = TRUE,
    controle_fixe = FALSE,
    ordre_nuit = 2
WHERE UPPER(TRIM(prenom)) = 'AYOUB';

UPDATE employes
SET travail_nuit_autorise = TRUE,
    controle_fixe = FALSE,
    ordre_nuit = 3
WHERE UPPER(TRIM(prenom)) IN ('YOUNESS', 'YOUNES');

-- Keep non-night employees clear for future dynamic night configuration.
UPDATE employes
SET ordre_nuit = NULL
WHERE UPPER(TRIM(prenom)) NOT IN ('SABER', 'AYOUB', 'YOUNESS', 'YOUNES');

-- Consistency: female employees are not night workers.
UPDATE employes
SET travail_nuit_autorise = FALSE,
    ordre_nuit = NULL
WHERE UPPER(TRIM(sexe)) IN ('FEMME', 'FEMALE');

-- Validation 1: show all employees with new configuration fields.
SELECT
  id, prenom, nom, sexe, groupe_id, actif,
  controle_fixe, controle_periode,
  travail_nuit_autorise, ordre_nuit,
  repos_base_target
FROM employes
ORDER BY id;

-- Validation 2: confirm active count. Expected: 10.
SELECT COUNT(*) AS active_employes
FROM employes
WHERE actif = TRUE;

-- Validation 3: confirm night-capable active employees.
-- Expected: SABER, AYOUB, YOUNESS with ordre_nuit 1, 2, 3.
SELECT prenom, nom, ordre_nuit
FROM employes
WHERE actif = TRUE
  AND travail_nuit_autorise = TRUE
  AND controle_fixe = FALSE
ORDER BY ordre_nuit;

-- Validation 4: confirm fixed controls.
-- Expected: MONCEF Matin, SAID Soir.
SELECT prenom, nom, controle_periode
FROM employes
WHERE actif = TRUE
  AND controle_fixe = TRUE
ORDER BY controle_periode;

-- Validation 5: confirm no active employee is missing a repos base target.
-- Expected: zero rows.
SELECT prenom, nom
FROM employes
WHERE actif = TRUE
  AND repos_base_target IS NULL;
