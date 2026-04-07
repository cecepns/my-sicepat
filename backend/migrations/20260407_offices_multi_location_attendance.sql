-- Migration: multi kantor absensi
-- Menambahkan tabel offices + relasi office untuk check-in/check-out attendance.
-- Idempotent: aman dijalankan berulang.

SET @db_name := DATABASE();

-- ---------------------------------------------------------------------------
-- Tabel kantor
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS offices (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(150) NOT NULL,
  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  radius_meter INT NOT NULL DEFAULT 300,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- Kolom office di attendance
-- ---------------------------------------------------------------------------
SET @exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'attendance'
    AND COLUMN_NAME = 'office_id_check_in'
);
SET @sql := IF(
  @exists = 0,
  'ALTER TABLE attendance ADD COLUMN office_id_check_in INT NULL AFTER user_id',
  'SELECT ''office_id_check_in exists'' AS note'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'attendance'
    AND COLUMN_NAME = 'office_id_check_out'
);
SET @sql := IF(
  @exists = 0,
  'ALTER TABLE attendance ADD COLUMN office_id_check_out INT NULL AFTER office_id_check_in',
  'SELECT ''office_id_check_out exists'' AS note'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- Foreign key office check-in
-- ---------------------------------------------------------------------------
SET @exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = @db_name
    AND TABLE_NAME = 'attendance'
    AND CONSTRAINT_NAME = 'fk_attendance_office_check_in'
);
SET @sql := IF(
  @exists = 0,
  'ALTER TABLE attendance ADD CONSTRAINT fk_attendance_office_check_in FOREIGN KEY (office_id_check_in) REFERENCES offices(id) ON DELETE SET NULL',
  'SELECT ''fk_attendance_office_check_in exists'' AS note'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- Foreign key office check-out
-- ---------------------------------------------------------------------------
SET @exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = @db_name
    AND TABLE_NAME = 'attendance'
    AND CONSTRAINT_NAME = 'fk_attendance_office_check_out'
);
SET @sql := IF(
  @exists = 0,
  'ALTER TABLE attendance ADD CONSTRAINT fk_attendance_office_check_out FOREIGN KEY (office_id_check_out) REFERENCES offices(id) ON DELETE SET NULL',
  'SELECT ''fk_attendance_office_check_out exists'' AS note'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- Seed awal dari legacy settings (jika offices masih kosong)
-- ---------------------------------------------------------------------------
INSERT INTO offices (name, latitude, longitude, radius_meter)
SELECT
  COALESCE(NULLIF(TRIM(s.office_name), ''), 'Kantor Utama') AS name,
  s.office_latitude,
  s.office_longitude,
  COALESCE(NULLIF(s.office_radius_meter, 0), 300) AS radius_meter
FROM settings s
WHERE s.office_latitude IS NOT NULL
  AND s.office_longitude IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM offices LIMIT 1)
LIMIT 1;
