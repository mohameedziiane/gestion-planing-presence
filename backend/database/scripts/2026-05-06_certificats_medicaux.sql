-- Phase 6: certificats medicaux.
-- Safe scope: creates only the certificate table. Does not modify planning, repos, or presence.
-- Validating a certificate may later update conge_soldes through the application.

USE gestion_planing_presence_v1;

CREATE TABLE IF NOT EXISTS certificats_medicaux (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employe_id INT NOT NULL,
  date_debut_absence DATE NOT NULL,
  date_fin_absence DATE NOT NULL,
  total_jours_absence INT NOT NULL,
  jours_couverts_certificat INT NOT NULL,
  jours_deduits_conge INT NOT NULL DEFAULT 0,
  motif TEXT NULL,
  fichier_url VARCHAR(500) NULL,
  statut ENUM('En attente','Validé','Refusé') NOT NULL DEFAULT 'En attente',
  decision_admin_id INT NULL,
  commentaire_admin TEXT NULL,
  decided_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_certificats_medicaux_employe
    FOREIGN KEY (employe_id) REFERENCES employes(id),
  CONSTRAINT fk_certificats_medicaux_decision_admin
    FOREIGN KEY (decision_admin_id) REFERENCES utilisateurs(id)
);

SET @schema_name = DATABASE();

SELECT COUNT(*)
INTO @index_exists
FROM information_schema.statistics
WHERE table_schema = @schema_name
  AND table_name = 'certificats_medicaux'
  AND index_name = 'idx_certificats_medicaux_employe_created';

SET @sql = IF(
  @index_exists = 0,
  'CREATE INDEX idx_certificats_medicaux_employe_created ON certificats_medicaux (employe_id, created_at)',
  'SELECT ''Index idx_certificats_medicaux_employe_created already exists'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT COUNT(*)
INTO @index_exists
FROM information_schema.statistics
WHERE table_schema = @schema_name
  AND table_name = 'certificats_medicaux'
  AND index_name = 'idx_certificats_medicaux_statut_created';

SET @sql = IF(
  @index_exists = 0,
  'CREATE INDEX idx_certificats_medicaux_statut_created ON certificats_medicaux (statut, created_at)',
  'SELECT ''Index idx_certificats_medicaux_statut_created already exists'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
