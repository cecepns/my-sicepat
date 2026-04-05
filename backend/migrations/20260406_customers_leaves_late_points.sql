-- Referensi: kolom attendance/settings untuk poin telat ditambahkan otomatis oleh backend/server.js saat start.

CREATE TABLE IF NOT EXISTS customers (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(150) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  address TEXT NOT NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

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
