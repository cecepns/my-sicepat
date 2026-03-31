-- Migration: add work-tracking fields to tasks table
-- Safe to run multiple times (checks column/index existence first).

SET @db_name := DATABASE();

-- started_at
SET @exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'tasks'
    AND COLUMN_NAME = 'started_at'
);
SET @sql := IF(@exists = 0, 'ALTER TABLE tasks ADD COLUMN started_at DATETIME NULL AFTER status', 'SELECT "started_at exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- completed_at
SET @exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'tasks'
    AND COLUMN_NAME = 'completed_at'
);
SET @sql := IF(@exists = 0, 'ALTER TABLE tasks ADD COLUMN completed_at DATETIME NULL AFTER started_at', 'SELECT "completed_at exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- start_latitude
SET @exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'tasks'
    AND COLUMN_NAME = 'start_latitude'
);
SET @sql := IF(@exists = 0, 'ALTER TABLE tasks ADD COLUMN start_latitude DECIMAL(10,7) NULL AFTER completed_at', 'SELECT "start_latitude exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- start_longitude
SET @exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'tasks'
    AND COLUMN_NAME = 'start_longitude'
);
SET @sql := IF(@exists = 0, 'ALTER TABLE tasks ADD COLUMN start_longitude DECIMAL(10,7) NULL AFTER start_latitude', 'SELECT "start_longitude exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- start_location_note
SET @exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'tasks'
    AND COLUMN_NAME = 'start_location_note'
);
SET @sql := IF(@exists = 0, 'ALTER TABLE tasks ADD COLUMN start_location_note VARCHAR(255) NULL AFTER start_longitude', 'SELECT "start_location_note exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- start_location_source
SET @exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'tasks'
    AND COLUMN_NAME = 'start_location_source'
);
SET @sql := IF(@exists = 0, 'ALTER TABLE tasks ADD COLUMN start_location_source ENUM("gps","manual") NULL AFTER start_location_note', 'SELECT "start_location_source exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- completion_latitude
SET @exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'tasks'
    AND COLUMN_NAME = 'completion_latitude'
);
SET @sql := IF(@exists = 0, 'ALTER TABLE tasks ADD COLUMN completion_latitude DECIMAL(10,7) NULL AFTER start_location_source', 'SELECT "completion_latitude exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- completion_longitude
SET @exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'tasks'
    AND COLUMN_NAME = 'completion_longitude'
);
SET @sql := IF(@exists = 0, 'ALTER TABLE tasks ADD COLUMN completion_longitude DECIMAL(10,7) NULL AFTER completion_latitude', 'SELECT "completion_longitude exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- completion_location_note
SET @exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'tasks'
    AND COLUMN_NAME = 'completion_location_note'
);
SET @sql := IF(@exists = 0, 'ALTER TABLE tasks ADD COLUMN completion_location_note VARCHAR(255) NULL AFTER completion_longitude', 'SELECT "completion_location_note exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- completion_location_source
SET @exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'tasks'
    AND COLUMN_NAME = 'completion_location_source'
);
SET @sql := IF(@exists = 0, 'ALTER TABLE tasks ADD COLUMN completion_location_source ENUM("gps","manual") NULL AFTER completion_location_note', 'SELECT "completion_location_source exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Optional index for active work status query
SET @idx_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'tasks'
    AND INDEX_NAME = 'idx_tasks_work_status'
);
SET @sql := IF(@idx_exists = 0, 'CREATE INDEX idx_tasks_work_status ON tasks (user_id, status, started_at, completed_at)', 'SELECT "idx_tasks_work_status exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
