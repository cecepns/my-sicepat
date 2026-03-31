-- Sales: tambah role + penugasan tugas (created_by_id) + catatan pengerjaan + laporan selesai + flag lampiran bukti selesai

SET @db_name := DATABASE();

-- users.role: tambah 'sales'
SET @col_type := (
  SELECT COLUMN_TYPE
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role'
  LIMIT 1
);
SET @sql := IF(
  @col_type IS NOT NULL AND @col_type NOT LIKE '%sales%',
  'ALTER TABLE users MODIFY COLUMN role ENUM(''admin'', ''user'', ''sales'') NOT NULL DEFAULT ''user''',
  'SELECT ''users.role already includes sales or column missing'' AS note'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- tasks.created_by_id (sales yang membuat tugas untuk teknisi di user_id)
SET @exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'created_by_id'
);
SET @sql := IF(@exists = 0, 'ALTER TABLE tasks ADD COLUMN created_by_id INT NULL AFTER user_id', 'SELECT ''created_by_id exists''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- tasks.work_progress_note (catatan/foto progres oleh teknisi)
SET @exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'work_progress_note'
);
SET @sql := IF(@exists = 0, 'ALTER TABLE tasks ADD COLUMN work_progress_note TEXT NULL', 'SELECT ''work_progress_note exists''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- tasks.completion_report (wajib saat selesai oleh teknisi)
SET @exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'completion_report'
);
SET @sql := IF(@exists = 0, 'ALTER TABLE tasks ADD COLUMN completion_report TEXT NULL', 'SELECT ''completion_report exists''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- task_attachments.is_completion: 1 = bukti selesai (foto wajib saat finish)
SET @exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'task_attachments' AND COLUMN_NAME = 'is_completion'
);
SET @sql := IF(@exists = 0, 'ALTER TABLE task_attachments ADD COLUMN is_completion TINYINT(1) NOT NULL DEFAULT 0 AFTER file_size', 'SELECT ''is_completion exists''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- FK opsional: dibuat hanya jika belum ada
SET @fk_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = @db_name AND TABLE_NAME = 'tasks' AND CONSTRAINT_NAME = 'fk_tasks_created_by'
);
SET @sql := IF(@fk_exists = 0,
  'ALTER TABLE tasks ADD CONSTRAINT fk_tasks_created_by FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE SET NULL',
  'SELECT ''fk_tasks_created_by exists''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
