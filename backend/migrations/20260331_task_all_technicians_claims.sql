-- Task assignment enhancement: creator visibility + all-technicians assignment + multi-claim (max 2)

SET @db_name := DATABASE();

-- tasks.user_id -> nullable (needed for assignment_scope = all_technicians)
SET @is_nullable := (
  SELECT IS_NULLABLE
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'user_id'
  LIMIT 1
);
SET @sql := IF(
  @is_nullable = 'NO',
  'ALTER TABLE tasks MODIFY COLUMN user_id INT NULL',
  'SELECT ''tasks.user_id already nullable'' AS note'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- tasks.assignment_scope
SET @exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'assignment_scope'
);
SET @sql := IF(
  @exists = 0,
  'ALTER TABLE tasks ADD COLUMN assignment_scope ENUM(''single'',''all_technicians'') NOT NULL DEFAULT ''single'' AFTER created_by_id',
  'SELECT ''assignment_scope exists'' AS note'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- tasks.max_claimants
SET @exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'max_claimants'
);
SET @sql := IF(
  @exists = 0,
  'ALTER TABLE tasks ADD COLUMN max_claimants INT NOT NULL DEFAULT 2 AFTER assignment_scope',
  'SELECT ''max_claimants exists'' AS note'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE tasks SET assignment_scope = 'single' WHERE assignment_scope IS NULL;
UPDATE tasks SET max_claimants = 2 WHERE max_claimants IS NULL OR max_claimants < 1;

-- task_claims table
CREATE TABLE IF NOT EXISTS task_claims (
  id INT PRIMARY KEY AUTO_INCREMENT,
  task_id INT NOT NULL,
  user_id INT NOT NULL,
  claimed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_task_claim_user (task_id, user_id),
  KEY idx_task_claim_task (task_id),
  KEY idx_task_claim_user (user_id),
  CONSTRAINT fk_task_claims_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_task_claims_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
