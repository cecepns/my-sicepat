-- Add task category field: PSB or Gangguan

SET @db_name := DATABASE();

SET @exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'tasks'
    AND COLUMN_NAME = 'task_category'
);

SET @sql := IF(
  @exists = 0,
  'ALTER TABLE tasks ADD COLUMN task_category ENUM(''psb'',''gangguan'') NOT NULL DEFAULT ''gangguan'' AFTER max_claimants',
  'SELECT ''task_category exists'' AS note'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE tasks
SET task_category = 'gangguan'
WHERE task_category IS NULL;
