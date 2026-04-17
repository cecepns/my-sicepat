-- Migration: tambah foto + kode/password mikrotik pelanggan
-- Idempotent: aman dijalankan berulang.

SET @db_name := DATABASE();

SET @exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'customers'
    AND COLUMN_NAME = 'photo_url'
);
SET @sql := IF(
  @exists = 0,
  'ALTER TABLE customers ADD COLUMN photo_url VARCHAR(255) NULL AFTER address',
  'SELECT ''photo_url exists'' AS note'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'customers'
    AND COLUMN_NAME = 'customer_code'
);
SET @sql := IF(
  @exists = 0,
  'ALTER TABLE customers ADD COLUMN customer_code VARCHAR(120) NULL AFTER phone',
  'SELECT ''customer_code exists'' AS note'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'customers'
    AND COLUMN_NAME = 'customer_password'
);
SET @sql := IF(
  @exists = 0,
  'ALTER TABLE customers ADD COLUMN customer_password VARCHAR(255) NULL AFTER customer_code',
  'SELECT ''customer_password exists'' AS note'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
