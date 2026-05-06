USE gestion_planing_presence_v1;
-- Phase 5: conge / ijaza tables.
-- Safe scope: creates only conge tables. Does not modify planning, repos, or presence.

CREATE TABLE IF NOT EXISTS conge_soldes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employe_id INT NOT NULL,
  annee INT NOT NULL,
  total_jours INT NOT NULL DEFAULT 18,
  jours_utilises INT NOT NULL DEFAULT 0,
  jours_restants INT NOT NULL DEFAULT 18,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_conge_solde_employe_annee (employe_id, annee),
  CONSTRAINT fk_conge_soldes_employe
    FOREIGN KEY (employe_id) REFERENCES employes(id)
);

CREATE TABLE IF NOT EXISTS demandes_conge (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employe_id INT NOT NULL,
  date_debut DATE NOT NULL,
  date_fin DATE NOT NULL,
  nombre_jours INT NOT NULL,
  type_conge ENUM('Annuel','Exceptionnel') NOT NULL DEFAULT 'Annuel',
  motif TEXT NULL,
  statut ENUM('En attente','Accepté','Refusé','Annulé') NOT NULL DEFAULT 'En attente',
  decision_admin_id INT NULL,
  commentaire_admin TEXT NULL,
  decided_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_demandes_conge_employe
    FOREIGN KEY (employe_id) REFERENCES employes(id),
  CONSTRAINT fk_demandes_conge_decision_admin
    FOREIGN KEY (decision_admin_id) REFERENCES utilisateurs(id)
);

SET @schema_name = DATABASE();

SELECT COUNT(*)
INTO @index_exists
FROM information_schema.statistics
WHERE table_schema = @schema_name
  AND table_name = 'demandes_conge'
  AND index_name = 'idx_demandes_conge_employe_created';

SET @sql = IF(
  @index_exists = 0,
  'CREATE INDEX idx_demandes_conge_employe_created ON demandes_conge (employe_id, created_at)',
  'SELECT ''Index idx_demandes_conge_employe_created already exists'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT COUNT(*)
INTO @index_exists
FROM information_schema.statistics
WHERE table_schema = @schema_name
  AND table_name = 'demandes_conge'
  AND index_name = 'idx_demandes_conge_statut_created';

SET @sql = IF(
  @index_exists = 0,
  'CREATE INDEX idx_demandes_conge_statut_created ON demandes_conge (statut, created_at)',
  'SELECT ''Index idx_demandes_conge_statut_created already exists'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

