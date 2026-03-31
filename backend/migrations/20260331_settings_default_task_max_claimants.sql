-- Add global default max claimants setting for all-technicians task assignment

SET @db_name := DATABASE();

SET @exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'settings'
    AND COLUMN_NAME = 'default_task_max_claimants'
);

SET @sql := IF(
  @exists = 0,
  'ALTER TABLE settings ADD COLUMN default_task_max_claimants INT NOT NULL DEFAULT 2 AFTER check_out_time',
  'SELECT ''default_task_max_claimants exists'' AS note'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE settings
SET default_task_max_claimants = 2
WHERE default_task_max_claimants IS NULL
   OR default_task_max_claimants < 1;
