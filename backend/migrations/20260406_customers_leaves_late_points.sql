-- Migration: pelanggan, izin absensi, poin telat (attendance + settings)
-- Jalankan sekali pada database yang dipakai aplikasi (contoh: my_sicepat).
-- Idempotent: bisa di-run ulang; kolom/tabel yang sudah ada dilewati.

-- ---------------------------------------------------------------------------
-- Tabel pelanggan
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(150) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  address TEXT NOT NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- Izin sakit / izin terlambat (keterangan wajib di aplikasi)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attendance_leaves (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  leave_date DATE NOT NULL,
  leave_type ENUM('sick', 'permission_late') NOT NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_attendance_leave_user_date (user_id, leave_date),
  KEY idx_leave_date (leave_date),
  CONSTRAINT fk_attendance_leaves_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- attendance: menit telat & poin telat per baris absensi
-- ---------------------------------------------------------------------------
SET @db_name := DATABASE();

SET @exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'attendance'
    AND COLUMN_NAME = 'late_minutes'
);
SET @sql := IF(
  @exists = 0,
  'ALTER TABLE attendance ADD COLUMN late_minutes INT NULL',
  'SELECT ''late_minutes exists'' AS note'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'attendance'
    AND COLUMN_NAME = 'late_points'
);
SET @sql := IF(
  @exists = 0,
  'ALTER TABLE attendance ADD COLUMN late_points INT NOT NULL DEFAULT 0',
  'SELECT ''late_points exists'' AS note'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- settings: nominal estimasi potongan per poin (tampilan / laporan)
-- ---------------------------------------------------------------------------
SET @exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'settings'
    AND COLUMN_NAME = 'late_penalty_per_point_rupiah'
);
SET @sql := IF(
  @exists = 0,
  'ALTER TABLE settings ADD COLUMN late_penalty_per_point_rupiah INT NOT NULL DEFAULT 10000',
  'SELECT ''late_penalty_per_point_rupiah exists'' AS note'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE settings
SET late_penalty_per_point_rupiah = 10000
WHERE late_penalty_per_point_rupiah IS NULL
   OR late_penalty_per_point_rupiah < 0;

-- ---------------------------------------------------------------------------
-- Multi kantor absensi (office list + relasi di attendance)
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

SET @exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'attendance'
    AND COLUMN_NAME = 'office_id_check_in'
);
SET @sql := IF(
  @exists = 0,
  'ALTER TABLE attendance ADD COLUMN office_id_check_in INT NULL',
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
  'ALTER TABLE attendance ADD COLUMN office_id_check_out INT NULL',
  'SELECT ''office_id_check_out exists'' AS note'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
