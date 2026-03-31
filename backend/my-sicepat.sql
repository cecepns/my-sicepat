CREATE DATABASE IF NOT EXISTS my_sicepat;
USE my_sicepat;

CREATE TABLE IF NOT EXISTS users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(120) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role ENUM('admin', 'user', 'sales') NOT NULL DEFAULT 'user',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
  id INT PRIMARY KEY AUTO_INCREMENT,
  office_name VARCHAR(150) NOT NULL DEFAULT 'Kantor Pusat',
  office_latitude DECIMAL(10, 7) NULL,
  office_longitude DECIMAL(10, 7) NULL,
  office_radius_meter INT NOT NULL DEFAULT 300,
  check_in_time TIME NOT NULL DEFAULT '08:00:00',
  check_out_time TIME NOT NULL DEFAULT '17:00:00',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS attendance (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  attendance_date DATE NOT NULL,
  check_in_time DATETIME NULL,
  check_out_time DATETIME NULL,
  check_in_latitude DECIMAL(10, 7) NULL,
  check_in_longitude DECIMAL(10, 7) NULL,
  check_out_latitude DECIMAL(10, 7) NULL,
  check_out_longitude DECIMAL(10, 7) NULL,
  gps_status_check_in ENUM('ON', 'OFF') DEFAULT 'OFF',
  gps_status_check_out ENUM('ON', 'OFF') DEFAULT 'OFF',
  location_note_check_in VARCHAR(255) NULL,
  location_note_check_out VARCHAR(255) NULL,
  distance_km_check_in DECIMAL(9, 3) NULL,
  distance_km_check_out DECIMAL(9, 3) NULL,
  in_radius_check_in TINYINT(1) NULL,
  in_radius_check_out TINYINT(1) NULL,
  admin_note TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_attendance_user_date (user_id, attendance_date),
  CONSTRAINT fk_attendance_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tasks (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NULL,
  created_by_id INT NULL,
  assignment_scope ENUM('single', 'all_technicians') NOT NULL DEFAULT 'single',
  max_claimants INT NOT NULL DEFAULT 2,
  title VARCHAR(200) NOT NULL,
  description TEXT NULL,
  deadline_date DATE NULL,
  status ENUM('todo', 'in_progress', 'done', 'cancelled') NOT NULL DEFAULT 'todo',
  started_at DATETIME NULL,
  completed_at DATETIME NULL,
  start_latitude DECIMAL(10, 7) NULL,
  start_longitude DECIMAL(10, 7) NULL,
  start_location_note VARCHAR(255) NULL,
  start_location_source ENUM('gps', 'manual') NULL,
  completion_latitude DECIMAL(10, 7) NULL,
  completion_longitude DECIMAL(10, 7) NULL,
  completion_location_note VARCHAR(255) NULL,
  completion_location_source ENUM('gps', 'manual') NULL,
  work_progress_note TEXT NULL,
  completion_report TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_tasks_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_tasks_created_by FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE SET NULL
);

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

CREATE TABLE IF NOT EXISTS task_attachments (
  id INT PRIMARY KEY AUTO_INCREMENT,
  task_id INT NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  file_size INT NOT NULL,
  is_completion TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_attachment_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

INSERT INTO settings (office_name, office_latitude, office_longitude, office_radius_meter, check_in_time, check_out_time)
SELECT 'Sicepat Office', -6.2087634, 106.845599, 300, '08:00:00', '17:00:00'
WHERE NOT EXISTS (SELECT 1 FROM settings);

-- password admin123
INSERT INTO users (name, email, password, role)
SELECT 'Administrator', 'admin@mysicepat.local', '$2b$10$3q4xYwKj0xWV.0xSgM9f4ODj9hsyQJQjX3E5f8LQTMQ6A22hZ11wO', 'admin'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'admin@mysicepat.local');
