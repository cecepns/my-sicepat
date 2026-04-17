const express = require('express')
const cors = require('cors')
const path = require('path')
const fs = require('fs')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const multer = require('multer')
const mysql = require('mysql2/promise')
require('dotenv').config()

const app = express()
const PORT = process.env.PORT || 4000
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret'
const uploadDir = path.join(__dirname, 'uploads-my-sicepat')

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })

const db = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'my_sicepat',
  waitForConnections: true,
  connectionLimit: 10,
})

const ensureTaskSchema = async () => {
  const [[roleRow]] = await db.query(
    `SELECT COLUMN_TYPE
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'users'
       AND COLUMN_NAME = 'role'`,
  )
  if (roleRow && !String(roleRow.COLUMN_TYPE).includes('sales')) {
    await db.query(`ALTER TABLE users MODIFY COLUMN role ENUM('admin', 'user', 'sales') NOT NULL DEFAULT 'user'`)
  }

  const [columns] = await db.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'tasks'`,
  )
  const existing = new Set(columns.map((col) => col.COLUMN_NAME))
  const alters = []
  if (!existing.has('created_by_id')) alters.push('ADD COLUMN created_by_id INT NULL AFTER user_id')
  if (!existing.has('assignment_scope')) alters.push("ADD COLUMN assignment_scope ENUM('single','all_technicians') NOT NULL DEFAULT 'single' AFTER created_by_id")
  if (!existing.has('max_claimants')) alters.push('ADD COLUMN max_claimants INT NOT NULL DEFAULT 2 AFTER assignment_scope')
  if (!existing.has('task_category')) alters.push("ADD COLUMN task_category ENUM('psb','gangguan') NOT NULL DEFAULT 'gangguan' AFTER max_claimants")
  if (!existing.has('started_at')) alters.push('ADD COLUMN started_at DATETIME NULL AFTER status')
  if (!existing.has('completed_at')) alters.push('ADD COLUMN completed_at DATETIME NULL AFTER started_at')
  if (!existing.has('start_latitude')) alters.push('ADD COLUMN start_latitude DECIMAL(10, 7) NULL AFTER completed_at')
  if (!existing.has('start_longitude')) alters.push('ADD COLUMN start_longitude DECIMAL(10, 7) NULL AFTER start_latitude')
  if (!existing.has('start_location_note')) alters.push('ADD COLUMN start_location_note VARCHAR(255) NULL AFTER start_longitude')
  if (!existing.has('start_location_source')) alters.push("ADD COLUMN start_location_source ENUM('gps','manual') NULL AFTER start_location_note")
  if (!existing.has('completion_latitude')) alters.push('ADD COLUMN completion_latitude DECIMAL(10, 7) NULL AFTER start_location_source')
  if (!existing.has('completion_longitude')) alters.push('ADD COLUMN completion_longitude DECIMAL(10, 7) NULL AFTER completion_latitude')
  if (!existing.has('completion_location_note')) alters.push('ADD COLUMN completion_location_note VARCHAR(255) NULL AFTER completion_longitude')
  if (!existing.has('completion_location_source')) alters.push("ADD COLUMN completion_location_source ENUM('gps','manual') NULL AFTER completion_location_note")
  if (!existing.has('work_progress_note')) alters.push('ADD COLUMN work_progress_note TEXT NULL')
  if (!existing.has('completion_report')) alters.push('ADD COLUMN completion_report TEXT NULL')
  if (alters.length) await db.query(`ALTER TABLE tasks ${alters.join(', ')}`)
  await db.query('ALTER TABLE tasks MODIFY COLUMN user_id INT NULL')
  await db.query(`UPDATE tasks SET assignment_scope='single' WHERE assignment_scope IS NULL`)
  await db.query(`UPDATE tasks SET max_claimants=2 WHERE max_claimants IS NULL OR max_claimants < 1`)

  const [attCols] = await db.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'task_attachments'`,
  )
  const attExisting = new Set(attCols.map((c) => c.COLUMN_NAME))
  if (!attExisting.has('is_completion')) {
    await db.query('ALTER TABLE task_attachments ADD COLUMN is_completion TINYINT(1) NOT NULL DEFAULT 0 AFTER file_size')
  }

  const [settingsCols] = await db.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'settings'`,
  )
  const settingsExisting = new Set(settingsCols.map((c) => c.COLUMN_NAME))
  if (!settingsExisting.has('default_task_max_claimants')) {
    await db.query('ALTER TABLE settings ADD COLUMN default_task_max_claimants INT NOT NULL DEFAULT 2 AFTER check_out_time')
  }
  await db.query('UPDATE settings SET default_task_max_claimants = 2 WHERE default_task_max_claimants IS NULL OR default_task_max_claimants < 1')

  await db.query(`
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
    )
  `)
}

/** Kolom telat di attendance — dipanggil saat startup dan (cadelayanan) di setiap request agar produksi tidak crash bila migrasi boot terlewat. */
const ensureAttendanceLateColumns = async () => {
  const [attLateCols] = await db.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'attendance'`,
  )
  const attLateExisting = new Set(attLateCols.map((c) => c.COLUMN_NAME))
  const attAlters = []
  if (!attLateExisting.has('late_minutes')) attAlters.push('ADD COLUMN late_minutes INT NULL')
  if (!attLateExisting.has('late_points')) attAlters.push('ADD COLUMN late_points INT NOT NULL DEFAULT 0')
  if (attAlters.length) await db.query(`ALTER TABLE attendance ${attAlters.join(', ')}`)
}

const ensureSettingsLatePenaltyColumn = async () => {
  const [settingsLateCols] = await db.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'settings'`,
  )
  const settingsLateExisting = new Set(settingsLateCols.map((c) => c.COLUMN_NAME))
  if (!settingsLateExisting.has('late_penalty_per_point_rupiah')) {
    await db.query('ALTER TABLE settings ADD COLUMN late_penalty_per_point_rupiah INT NOT NULL DEFAULT 10000')
  }
  const [settingsLateCols2] = await db.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'settings'
       AND COLUMN_NAME = 'late_penalty_per_point_rupiah'`,
  )
  if (settingsLateCols2.length) {
    await db.query('UPDATE settings SET late_penalty_per_point_rupiah = 10000 WHERE late_penalty_per_point_rupiah IS NULL OR late_penalty_per_point_rupiah < 0')
  }
}

let coreLateSchemaPromise = null
const ensureCoreLateSchemaForRequest = async () => {
  if (!coreLateSchemaPromise) {
    coreLateSchemaPromise = (async () => {
      await ensureAttendanceLateColumns()
      await ensureSettingsLatePenaltyColumn()
    })().catch((err) => {
      coreLateSchemaPromise = null
      throw err
    })
  }
  await coreLateSchemaPromise
}

const ensureCustomersLeavesLateSchema = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS customers (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(150) NOT NULL,
      phone VARCHAR(30) NOT NULL,
      address TEXT NOT NULL,
      status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `)
  await db.query(`
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
    )
  `)

  await ensureAttendanceLateColumns()
  await ensureSettingsLatePenaltyColumn()
}

const ensureCustomersExtraColumns = async () => {
  const [customerCols] = await db.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'customers'`,
  )
  const existing = new Set(customerCols.map((c) => c.COLUMN_NAME))
  const alters = []
  if (!existing.has('photo_url')) alters.push('ADD COLUMN photo_url VARCHAR(255) NULL AFTER address')
  if (!existing.has('customer_code')) alters.push('ADD COLUMN customer_code VARCHAR(120) NULL AFTER phone')
  if (!existing.has('customer_password')) alters.push('ADD COLUMN customer_password VARCHAR(255) NULL AFTER customer_code')
  if (alters.length) await db.query(`ALTER TABLE customers ${alters.join(', ')}`)
}

const ensureOfficesSchema = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS offices (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(150) NOT NULL,
      latitude DECIMAL(10,7) NOT NULL,
      longitude DECIMAL(10,7) NOT NULL,
      radius_meter INT NOT NULL DEFAULT 300,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `)

  const [attCols] = await db.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'attendance'`,
  )
  const attExisting = new Set(attCols.map((c) => c.COLUMN_NAME))
  const alters = []
  if (!attExisting.has('office_id_check_in')) alters.push('ADD COLUMN office_id_check_in INT NULL AFTER user_id')
  if (!attExisting.has('office_id_check_out')) alters.push('ADD COLUMN office_id_check_out INT NULL AFTER office_id_check_in')
  if (alters.length) await db.query(`ALTER TABLE attendance ${alters.join(', ')}`)

  const [fkRows] = await db.query(
    `SELECT CONSTRAINT_NAME
     FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = DATABASE()
       AND TABLE_NAME = 'attendance'
       AND CONSTRAINT_NAME = 'fk_attendance_office_check_in'`,
  )
  if (!fkRows.length) {
    await db.query(
      'ALTER TABLE attendance ADD CONSTRAINT fk_attendance_office_check_in FOREIGN KEY (office_id_check_in) REFERENCES offices(id) ON DELETE SET NULL',
    )
  }
  const [fkRows2] = await db.query(
    `SELECT CONSTRAINT_NAME
     FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = DATABASE()
       AND TABLE_NAME = 'attendance'
       AND CONSTRAINT_NAME = 'fk_attendance_office_check_out'`,
  )
  if (!fkRows2.length) {
    await db.query(
      'ALTER TABLE attendance ADD CONSTRAINT fk_attendance_office_check_out FOREIGN KEY (office_id_check_out) REFERENCES offices(id) ON DELETE SET NULL',
    )
  }

  const [[officeCount]] = await db.query('SELECT COUNT(*) AS total FROM offices')
  if (!Number(officeCount?.total || 0)) {
    const [[legacySettings]] = await db.query('SELECT office_name, office_latitude, office_longitude, office_radius_meter FROM settings LIMIT 1')
    if (legacySettings?.office_latitude !== null && legacySettings?.office_longitude !== null) {
      await db.query('INSERT INTO offices (name, latitude, longitude, radius_meter) VALUES (?, ?, ?, ?)', [
        String(legacySettings.office_name || 'Kantor Utama'),
        legacySettings.office_latitude,
        legacySettings.office_longitude,
        Number(legacySettings.office_radius_meter || 300),
      ])
    }
  }
}

const formatDateYmd = (d) => {
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10)
  const dt = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(dt.getTime())) return String(d).slice(0, 10)
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const day = String(dt.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const parseScheduleDateTime = (dateStr, checkInTimeVal) => {
  if (!dateStr || !checkInTimeVal) return null
  const t = String(checkInTimeVal)
  const parts = t.split(':').map((p) => Number(p))
  const h = parts[0] || 0
  const mi = parts[1] || 0
  const se = parts[2] || 0
  const [y, mo, da] = dateStr.split('-').map(Number)
  return new Date(y, mo - 1, da, h, mi, se, 0)
}

const computeLateMinutesAndPoints = (checkInDate, scheduleTimeVal, hasLeaveWaive) => {
  if (!checkInDate) return { late_minutes: null, late_points: 0 }
  const sched = parseScheduleDateTime(formatDateYmd(checkInDate), scheduleTimeVal)
  if (!sched) return { late_minutes: null, late_points: 0 }
  const actual = checkInDate instanceof Date ? checkInDate : new Date(checkInDate)
  if (actual <= sched) return { late_minutes: 0, late_points: 0 }
  const lateMinutes = Math.floor((actual - sched) / 60000)
  if (hasLeaveWaive) return { late_minutes: lateMinutes, late_points: 0 }
  const latePoints = lateMinutes > 60 ? 2 : 1
  return { late_minutes: lateMinutes, late_points: latePoints }
}

const fetchLeaveWaiveForUserDate = async (userId, dateStr) => {
  const [rows] = await db.query('SELECT id FROM attendance_leaves WHERE user_id=? AND leave_date=? LIMIT 1', [userId, dateStr])
  return Boolean(rows.length)
}

const applyLatePointsToAttendanceRow = async (attendanceId, userId, attendanceDateStr, checkInMysql) => {
  const [[settingsRow]] = await db.query('SELECT check_in_time FROM settings LIMIT 1')
  const waive = await fetchLeaveWaiveForUserDate(userId, attendanceDateStr)
  const checkInDt = checkInMysql ? new Date(checkInMysql) : null
  const { late_minutes, late_points } = computeLateMinutesAndPoints(checkInDt, settingsRow?.check_in_time, waive)
  await db.query('UPDATE attendance SET late_minutes=?, late_points=? WHERE id=?', [late_minutes, late_points, attendanceId])
}

const insertTaskAttachments = async (taskId, files, isCompletion) => {
  if (!files?.length) return
  const values = files.map((file) => [taskId, file.originalname, file.filename, file.mimetype, file.size, isCompletion ? 1 : 0])
  await db.query(
    'INSERT INTO task_attachments (task_id, original_name, stored_name, mime_type, file_size, is_completion) VALUES ?',
    [values],
  )
}

const canManageTaskMeta = (req, task) =>
  req.user.role === 'admin' || (req.user.role === 'sales' && task.created_by_id === req.user.id)

const isTaskAssignee = async (req, task) => {
  if (task.user_id === req.user.id) return true
  if (task.assignment_scope !== 'all_technicians') return false
  const [rows] = await db.query('SELECT id FROM task_claims WHERE task_id=? AND user_id=? LIMIT 1', [task.id, req.user.id])
  return Boolean(rows.length)
}

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname)
    const base = path.basename(file.originalname, ext).replace(/\s+/g, '-')
    cb(null, `${Date.now()}-${base}${ext}`)
  },
})
const upload = multer({ storage })

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))
app.use('/uploads-my-sicepat', express.static(uploadDir))

/** Pastikan kolom late_minutes / late_points / late_penalty ada sebelum route lain (mencegah ER_BAD_FIELD_ERROR jika migrasi boot tidak jalan). */
app.use(async (req, res, next) => {
  try {
    await ensureCoreLateSchemaForRequest()
    next()
  } catch (error) {
    next(error)
  }
})

const authMiddleware = (roles = []) => (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ message: 'Unauthorized' })
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    if (roles.length && !roles.includes(payload.role)) {
      return res.status(403).json({ message: 'Forbidden' })
    }
    req.user = payload
    return next()
  } catch {
    return res.status(401).json({ message: 'Token invalid' })
  }
}

const toPagination = (page = 1, limit = 10) => ({
  page: Number(page) > 0 ? Number(page) : 1,
  limit: Number(limit) > 0 ? Number(limit) : 10,
})

const haversineKm = (lat1, lon1, lat2, lon2) => {
  const toRad = (v) => (v * Math.PI) / 180
  const R = 6371
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

const uploadsBaseUrl = '/uploads-my-sicepat'
const buildUploadUrl = (filename) => (filename ? `${uploadsBaseUrl}/${filename}` : null)
const resolveUploadPathFromUrl = (urlValue) => {
  const val = String(urlValue || '')
  if (!val.startsWith(uploadsBaseUrl)) return null
  const fileName = val.slice(uploadsBaseUrl.length + 1)
  if (!fileName) return null
  return path.join(uploadDir, path.basename(fileName))
}

app.get('/api/health', (_, res) => res.json({ ok: true }))

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body
    const [rows] = await db.query('SELECT id, name, email, password, role, is_active FROM users WHERE email = ?', [email])
    const user = rows[0]
    if (!user || !user.is_active) return res.status(401).json({ message: 'Email/password salah atau user nonaktif' })
    const valid = await bcrypt.compare(password, user.password)
    if (!valid) return res.status(401).json({ message: 'Email/password salah' })
    const token = jwt.sign({ id: user.id, role: user.role, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '7d' })
    return res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } })
  } catch (error) {
    return res.status(500).json({ message: error.message })
  }
})

app.get('/api/settings', authMiddleware(), async (_, res) => {
  const [rows] = await db.query('SELECT * FROM settings LIMIT 1')
  res.json(rows[0] || null)
})

app.put('/api/settings', authMiddleware(['admin']), async (req, res) => {
  const { office_name, office_latitude, office_longitude, office_radius_meter, check_in_time, check_out_time } = req.body
  const incomingMaxClaimants = Number(req.body.default_task_max_claimants)
  const defaultTaskMaxClaimants = Number.isFinite(incomingMaxClaimants) && incomingMaxClaimants > 0 ? incomingMaxClaimants : 2
  const incomingPenalty = Number(req.body.late_penalty_per_point_rupiah)
  const latePenaltyPerPoint =
    Number.isFinite(incomingPenalty) && incomingPenalty >= 0 ? Math.floor(incomingPenalty) : 10000
  const [rows] = await db.query('SELECT id FROM settings LIMIT 1')
  if (rows.length) {
    await db.query(
      `UPDATE settings SET office_name=?, office_latitude=?, office_longitude=?, office_radius_meter=?, check_in_time=?, check_out_time=?, default_task_max_claimants=?, late_penalty_per_point_rupiah=?, updated_at=NOW() WHERE id=?`,
      [
        office_name,
        office_latitude,
        office_longitude,
        office_radius_meter,
        check_in_time,
        check_out_time,
        defaultTaskMaxClaimants,
        latePenaltyPerPoint,
        rows[0].id,
      ],
    )
  } else {
    await db.query(
      `INSERT INTO settings (office_name, office_latitude, office_longitude, office_radius_meter, check_in_time, check_out_time, default_task_max_claimants, late_penalty_per_point_rupiah) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        office_name,
        office_latitude,
        office_longitude,
        office_radius_meter,
        check_in_time,
        check_out_time,
        defaultTaskMaxClaimants,
        latePenaltyPerPoint,
      ],
    )
  }
  res.json({ message: 'Settings berhasil disimpan' })
})

app.get('/api/offices', authMiddleware(), async (_, res) => {
  const [rows] = await db.query('SELECT id, name, latitude, longitude, radius_meter, created_at, updated_at FROM offices ORDER BY name ASC')
  res.json(rows)
})

app.post('/api/offices', authMiddleware(['admin']), async (req, res) => {
  const name = String(req.body?.name || '').trim()
  const latitude = Number(req.body?.latitude)
  const longitude = Number(req.body?.longitude)
  const radiusMeterRaw = Number(req.body?.radius_meter)
  const radius_meter = Number.isFinite(radiusMeterRaw) && radiusMeterRaw > 0 ? Math.floor(radiusMeterRaw) : 300
  if (!name) return res.status(400).json({ message: 'Nama kantor wajib diisi' })
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return res.status(400).json({ message: 'Latitude / longitude kantor tidak valid' })
  }
  const [result] = await db.query('INSERT INTO offices (name, latitude, longitude, radius_meter) VALUES (?, ?, ?, ?)', [
    name,
    latitude,
    longitude,
    radius_meter,
  ])
  res.json({ message: 'Kantor berhasil ditambah', id: result.insertId })
})

app.put('/api/offices/:id', authMiddleware(['admin']), async (req, res) => {
  const name = String(req.body?.name || '').trim()
  const latitude = Number(req.body?.latitude)
  const longitude = Number(req.body?.longitude)
  const radiusMeterRaw = Number(req.body?.radius_meter)
  const radius_meter = Number.isFinite(radiusMeterRaw) && radiusMeterRaw > 0 ? Math.floor(radiusMeterRaw) : 300
  if (!name) return res.status(400).json({ message: 'Nama kantor wajib diisi' })
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return res.status(400).json({ message: 'Latitude / longitude kantor tidak valid' })
  }
  const [result] = await db.query('UPDATE offices SET name=?, latitude=?, longitude=?, radius_meter=?, updated_at=NOW() WHERE id=?', [
    name,
    latitude,
    longitude,
    radius_meter,
    req.params.id,
  ])
  if (!result.affectedRows) return res.status(404).json({ message: 'Kantor tidak ditemukan' })
  res.json({ message: 'Kantor berhasil diupdate' })
})

app.delete('/api/offices/:id', authMiddleware(['admin']), async (req, res) => {
  const [usedRows] = await db.query(
    'SELECT id FROM attendance WHERE office_id_check_in = ? OR office_id_check_out = ? LIMIT 1',
    [req.params.id, req.params.id],
  )
  if (usedRows.length) {
    return res.status(400).json({ message: 'Kantor sudah dipakai di data absensi, tidak bisa dihapus' })
  }
  const [result] = await db.query('DELETE FROM offices WHERE id=?', [req.params.id])
  if (!result.affectedRows) return res.status(404).json({ message: 'Kantor tidak ditemukan' })
  res.json({ message: 'Kantor berhasil dihapus' })
})

app.get('/api/users', authMiddleware(['admin']), async (req, res) => {
  const { search = '', page = 1, limit = 10 } = req.query
  const pg = toPagination(page, limit)
  const offset = (pg.page - 1) * pg.limit
  const searchQuery = `%${search}%`
  const [rows] = await db.query(
    `SELECT id, name, email, role, is_active, created_at
     FROM users
     WHERE name LIKE ? OR email LIKE ?
     ORDER BY id DESC
     LIMIT ? OFFSET ?`,
    [searchQuery, searchQuery, pg.limit, offset],
  )
  const [countRows] = await db.query('SELECT COUNT(*) AS total FROM users WHERE name LIKE ? OR email LIKE ?', [searchQuery, searchQuery])
  res.json({ data: rows, total: countRows[0].total, page: pg.page, limit: pg.limit })
})

app.get('/api/users/work-status', authMiddleware(), async (req, res) => {
  const { search = '', page = 1, limit = 10 } = req.query
  const pg = toPagination(page, limit)
  const safeLimit = Math.min(pg.limit, 10)
  const offset = (pg.page - 1) * safeLimit
  const searchQuery = `%${search}%`
  const [rows] = await db.query(
    `SELECT
      u.id,
      u.name,
      u.email,
      u.role,
      u.is_active,
      t.id AS active_task_id,
      t.title AS active_task_title,
      t.started_at AS active_task_started_at
     FROM users u
     LEFT JOIN tasks t
       ON t.id = (
         SELECT t1.id
         FROM tasks t1
         LEFT JOIN task_claims c1
           ON c1.task_id = t1.id
          AND c1.user_id = u.id
         WHERE t1.started_at IS NOT NULL
           AND t1.completed_at IS NULL
           AND t1.status = 'in_progress'
           AND (
             t1.user_id = u.id
             OR (t1.assignment_scope = 'all_technicians' AND c1.id IS NOT NULL)
           )
         ORDER BY t1.started_at DESC, t1.id DESC
         LIMIT 1
       )
     WHERE (u.name LIKE ? OR u.email LIKE ?)
       AND u.role = 'user'
     ORDER BY u.name ASC
     LIMIT ? OFFSET ?`,
    [searchQuery, searchQuery, safeLimit, offset],
  )
  const [countRows] = await db.query(
    `SELECT COUNT(*) AS total
     FROM users u
     WHERE (u.name LIKE ? OR u.email LIKE ?)
       AND u.role = 'user'`,
    [searchQuery, searchQuery],
  )
  const data = rows.map((row) => ({
    ...row,
    work_status: row.active_task_id ? 'working' : 'free',
  }))
  res.json({ data, total: countRows[0].total, page: pg.page, limit: safeLimit })
})

app.post('/api/users', authMiddleware(['admin']), async (req, res) => {
  const { name, email, password, role = 'user' } = req.body
  const hashed = await bcrypt.hash(password, 10)
  await db.query('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)', [name, email, hashed, role])
  res.json({ message: 'User berhasil dibuat' })
})

app.put('/api/users/:id', authMiddleware(['admin']), async (req, res) => {
  const { name, email, role, is_active, password } = req.body
  if (password) {
    const hashed = await bcrypt.hash(password, 10)
    await db.query('UPDATE users SET name=?, email=?, role=?, is_active=?, password=? WHERE id=?', [name, email, role, is_active, hashed, req.params.id])
  } else {
    await db.query('UPDATE users SET name=?, email=?, role=?, is_active=? WHERE id=?', [name, email, role, is_active, req.params.id])
  }
  res.json({ message: 'User berhasil diupdate' })
})

app.delete('/api/users/:id', authMiddleware(['admin']), async (req, res) => {
  await db.query('DELETE FROM users WHERE id=?', [req.params.id])
  res.json({ message: 'User berhasil dihapus' })
})

app.get('/api/attendance', authMiddleware(), async (req, res) => {
  const { search = '', page = 1, limit = 10, user_id = '', date = '' } = req.query
  const pg = toPagination(page, limit)
  const offset = (pg.page - 1) * pg.limit
  const isAdmin = req.user.role === 'admin'
  const where = ['(u.name LIKE ? OR u.email LIKE ?)']
  const params = [`%${search}%`, `%${search}%`]
  if (!isAdmin) {
    where.push('a.user_id = ?')
    params.push(req.user.id)
  } else if (user_id) {
    where.push('a.user_id = ?')
    params.push(user_id)
  }
  if (date) {
    where.push('DATE(a.attendance_date) = ?')
    params.push(date)
  }
  const whereClause = where.join(' AND ')
  const query = `SELECT a.*, u.name AS user_name, u.email AS user_email, u.role AS user_role,
                 al.leave_type AS leave_type, al.note AS leave_note,
                 oci.name AS office_name_check_in, oco.name AS office_name_check_out
                 FROM attendance a
                 JOIN users u ON u.id = a.user_id
                 LEFT JOIN offices oci ON oci.id = a.office_id_check_in
                 LEFT JOIN offices oco ON oco.id = a.office_id_check_out
                 LEFT JOIN attendance_leaves al ON al.user_id = a.user_id AND al.leave_date = a.attendance_date
                 WHERE ${whereClause}
                 ORDER BY a.attendance_date DESC, a.id DESC
                 LIMIT ? OFFSET ?`
  const [rows] = await db.query(query, [...params, pg.limit, offset])
  const [countRows] = await db.query(
    `SELECT COUNT(*) AS total
     FROM attendance a
     JOIN users u ON u.id = a.user_id
     WHERE ${whereClause}`,
    params,
  )
  res.json({ data: rows, total: countRows[0].total, page: pg.page, limit: pg.limit })
})

app.post('/api/attendance/check-in', authMiddleware(), async (req, res) => {
  const { latitude = null, longitude = null, location_note = null } = req.body
  const officeId = Number(req.body?.office_id)
  if (!Number.isFinite(officeId) || officeId < 1) return res.status(400).json({ message: 'Pilih kantor terlebih dahulu' })
  const [officeRows] = await db.query('SELECT * FROM offices WHERE id = ? LIMIT 1', [officeId])
  const office = officeRows[0]
  if (!office) return res.status(400).json({ message: 'Kantor tidak ditemukan' })
  const attendanceDate = new Date()
  const dateString = attendanceDate.toISOString().slice(0, 10)

  let gpsStatus = 'OFF'
  let distanceKm = null
  if (latitude !== null && longitude !== null) {
    gpsStatus = 'ON'
    distanceKm = haversineKm(Number(latitude), Number(longitude), Number(office.latitude), Number(office.longitude))
  }
  const withinOfficeRadius = distanceKm !== null ? distanceKm * 1000 <= Number(office.radius_meter || 300) : null

  const [existingRows] = await db.query('SELECT id FROM attendance WHERE user_id = ? AND DATE(attendance_date) = ?', [req.user.id, dateString])
  if (existingRows.length) return res.status(400).json({ message: 'Check-in hari ini sudah ada' })

  const [ins] = await db.query(
    `INSERT INTO attendance
     (user_id, office_id_check_in, attendance_date, check_in_time, check_in_latitude, check_in_longitude, gps_status_check_in, location_note_check_in, distance_km_check_in, in_radius_check_in)
     VALUES (?, ?, CURDATE(), NOW(), ?, ?, ?, ?, ?, ?)`,
    [req.user.id, officeId, latitude, longitude, gpsStatus, location_note, distanceKm, withinOfficeRadius],
  )
  const [insertedRows] = await db.query('SELECT id, attendance_date, check_in_time FROM attendance WHERE id=?', [ins.insertId])
  const row = insertedRows[0]
  await applyLatePointsToAttendanceRow(row.id, req.user.id, formatDateYmd(row.attendance_date), row.check_in_time)
  res.json({ message: 'Check-in berhasil' })
})

app.post('/api/attendance/check-out', authMiddleware(), async (req, res) => {
  const { latitude = null, longitude = null, location_note = null } = req.body
  const officeId = Number(req.body?.office_id)
  if (!Number.isFinite(officeId) || officeId < 1) return res.status(400).json({ message: 'Pilih kantor terlebih dahulu' })
  const [officeRows] = await db.query('SELECT * FROM offices WHERE id = ? LIMIT 1', [officeId])
  const office = officeRows[0]
  if (!office) return res.status(400).json({ message: 'Kantor tidak ditemukan' })
  const dateString = new Date().toISOString().slice(0, 10)
  const [rows] = await db.query('SELECT * FROM attendance WHERE user_id = ? AND DATE(attendance_date) = ?', [req.user.id, dateString])
  if (!rows.length) return res.status(400).json({ message: 'Belum check-in hari ini' })
  if (rows[0].check_out_time) return res.status(400).json({ message: 'Sudah check-out hari ini' })

  let gpsStatus = 'OFF'
  let distanceKm = null
  if (latitude !== null && longitude !== null) {
    gpsStatus = 'ON'
    distanceKm = haversineKm(Number(latitude), Number(longitude), Number(office.latitude), Number(office.longitude))
  }
  const withinOfficeRadius = distanceKm !== null ? distanceKm * 1000 <= Number(office.radius_meter || 300) : null

  await db.query(
    `UPDATE attendance
     SET office_id_check_out = ?,
         check_out_time = NOW(),
         check_out_latitude = ?,
         check_out_longitude = ?,
         gps_status_check_out = ?,
         location_note_check_out = ?,
         distance_km_check_out = ?,
         in_radius_check_out = ?
     WHERE id = ?`,
    [officeId, latitude, longitude, gpsStatus, location_note, distanceKm, withinOfficeRadius, rows[0].id],
  )
  res.json({ message: 'Check-out berhasil' })
})

app.post('/api/attendance/admin-mark', authMiddleware(['admin']), async (req, res) => {
  const { user_id, attendance_date, check_in_time = null, check_out_time = null, note = null } = req.body
  await db.query(
    `INSERT INTO attendance (user_id, attendance_date, check_in_time, check_out_time, admin_note)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE check_in_time=VALUES(check_in_time), check_out_time=VALUES(check_out_time), admin_note=VALUES(admin_note)`,
    [user_id, attendance_date, check_in_time, check_out_time, note],
  )
  const [arows] = await db.query('SELECT id, user_id, attendance_date, check_in_time FROM attendance WHERE user_id=? AND attendance_date=? LIMIT 1', [
    user_id,
    attendance_date,
  ])
  if (arows.length && arows[0].check_in_time) {
    await applyLatePointsToAttendanceRow(arows[0].id, arows[0].user_id, formatDateYmd(arows[0].attendance_date), arows[0].check_in_time)
  }
  res.json({ message: 'Absen user berhasil disimpan' })
})

app.put('/api/attendance/:id', authMiddleware(['admin']), async (req, res) => {
  const { user_id, attendance_date, check_in_time = null, check_out_time = null, note = null } = req.body
  const [rows] = await db.query('SELECT id FROM attendance WHERE id=?', [req.params.id])
  if (!rows.length) return res.status(404).json({ message: 'Data absensi tidak ditemukan' })

  await db.query(
    `UPDATE attendance
     SET user_id=?,
         attendance_date=?,
         check_in_time=?,
         check_out_time=?,
         admin_note=?
     WHERE id=?`,
    [user_id, attendance_date, check_in_time, check_out_time, note, req.params.id],
  )
  const [updated] = await db.query('SELECT id, user_id, attendance_date, check_in_time FROM attendance WHERE id=?', [req.params.id])
  if (updated.length && updated[0].check_in_time) {
    await applyLatePointsToAttendanceRow(updated[0].id, updated[0].user_id, formatDateYmd(updated[0].attendance_date), updated[0].check_in_time)
  } else if (updated.length) {
    await db.query('UPDATE attendance SET late_minutes=NULL, late_points=0 WHERE id=?', [req.params.id])
  }
  res.json({ message: 'Absensi berhasil diupdate' })
})

app.delete('/api/attendance/:id', authMiddleware(['admin']), async (req, res) => {
  const [result] = await db.query('DELETE FROM attendance WHERE id=?', [req.params.id])
  if (result.affectedRows === 0) {
    return res.json({ message: 'Data absensi sudah tidak ada', already_deleted: true })
  }
  return res.json({ message: 'Absensi berhasil dihapus', already_deleted: false })
})

app.get('/api/tasks', authMiddleware(), async (req, res) => {
  const { search = '', page = 1, limit = 10, user_id = '', date = '' } = req.query
  const pg = toPagination(page, limit)
  const offset = (pg.page - 1) * pg.limit
  const role = req.user.role
  const where = ['(t.title LIKE ? OR t.description LIKE ? OR IFNULL(u.name,"") LIKE ? OR IFNULL(cb.name,"") LIKE ? OR IFNULL(tc.claimed_names,"") LIKE ?)']
  const params = [`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`]
  if (role === 'admin') {
    if (user_id) {
      where.push('t.user_id = ?')
      params.push(user_id)
    }
  } else {
    // Sales dan user dapat melihat semua tugas lintas pembuat/assignee
  }
  if (date) {
    where.push('DATE(t.created_at) = ?')
    params.push(date)
  }
  const whereClause = where.join(' AND ')
  const [rows] = await db.query(
    `SELECT
      t.*,
      TIMESTAMPDIFF(SECOND, t.started_at, COALESCE(t.completed_at, NOW())) AS work_duration_seconds,
      COALESCE(u.name, 'Semua teknisi') AS user_name,
      cb.name AS created_by_name,
      cb.role AS created_by_role,
      IFNULL(tc.claimed_total, 0) AS claimed_total,
      IFNULL(tc.claimed_names, '') AS claimed_names
     FROM tasks t
     LEFT JOIN users u ON u.id=t.user_id
     LEFT JOIN users cb ON cb.id=t.created_by_id
     LEFT JOIN (
       SELECT
         c.task_id,
         COUNT(*) AS claimed_total,
         GROUP_CONCAT(u2.name ORDER BY c.claimed_at ASC SEPARATOR ', ') AS claimed_names
       FROM task_claims c
       JOIN users u2 ON u2.id = c.user_id
       GROUP BY c.task_id
     ) tc ON tc.task_id = t.id
     WHERE ${whereClause}
     ORDER BY t.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, pg.limit, offset],
  )
  const [countRows] = await db.query(
    `SELECT COUNT(*) AS total
     FROM tasks t
     LEFT JOIN users u ON u.id=t.user_id
     LEFT JOIN users cb ON cb.id=t.created_by_id
     LEFT JOIN (
       SELECT
         c.task_id,
         GROUP_CONCAT(u2.name ORDER BY c.claimed_at ASC SEPARATOR ', ') AS claimed_names
       FROM task_claims c
       JOIN users u2 ON u2.id = c.user_id
       GROUP BY c.task_id
     ) tc ON tc.task_id = t.id
     WHERE ${whereClause}`,
    params,
  )
  if (!rows.length) return res.json({ data: [], total: 0, page: pg.page, limit: pg.limit })

  const taskIds = rows.map((it) => it.id)
  const [attachments] = await db.query('SELECT * FROM task_attachments WHERE task_id IN (?) ORDER BY id DESC', [taskIds])
  const [claims] = await db.query(
    `SELECT c.task_id, c.user_id, c.claimed_at, u.name AS user_name
     FROM task_claims c
     JOIN users u ON u.id = c.user_id
     WHERE c.task_id IN (?)
     ORDER BY c.claimed_at ASC`,
    [taskIds],
  )
  const mapped = rows.map((task) => {
    const taskClaims = claims.filter((item) => item.task_id === task.id)
    return {
      ...task,
      max_claimants: task.max_claimants || 2,
      claimed_by: taskClaims,
      attachments: attachments.filter((att) => att.task_id === task.id),
    }
  })
  return res.json({ data: mapped, total: countRows[0].total, page: pg.page, limit: pg.limit })
})

app.post('/api/tasks', authMiddleware(['admin', 'sales', 'user']), upload.array('attachments', 10), async (req, res) => {
  const {
    title,
    description,
    deadline_date,
    status = 'todo',
    location_source = 'manual',
    location_note = null,
    latitude = null,
    longitude = null,
    assigned_user_id,
    user_id: bodyUserId,
    assignment_scope = 'single',
    task_category = 'gangguan',
  } = req.body
  const safeScope = assignment_scope === 'all_technicians' ? 'all_technicians' : 'single'
  const safeTaskCategory = task_category === 'psb' ? 'psb' : 'gangguan'
  const rawAssignee = assigned_user_id ?? bodyUserId
  const assigneeId = rawAssignee !== undefined && rawAssignee !== null && rawAssignee !== '' ? Number(rawAssignee) : null

  let targetUserId = null
  const createdById = req.user.id
  const [[settingsRow]] = await db.query('SELECT default_task_max_claimants FROM settings LIMIT 1')
  const defaultMaxClaimants = Math.max(Number(settingsRow?.default_task_max_claimants || 2), 1)

  if (req.user.role === 'sales') {
    if (safeScope === 'all_technicians') {
      targetUserId = null
    } else {
      if (!assigneeId || Number.isNaN(assigneeId)) return res.status(400).json({ message: 'Teknisi (pegawai) wajib dipilih' })
      const [techRows] = await db.query('SELECT id, role FROM users WHERE id = ? AND is_active = 1', [assigneeId])
      if (!techRows.length || techRows[0].role !== 'user') return res.status(400).json({ message: 'Teknisi tidak valid' })
      targetUserId = assigneeId
    }
  } else if (req.user.role === 'admin') {
    if (safeScope === 'all_technicians') {
      targetUserId = null
    } else {
      if (!assigneeId || Number.isNaN(assigneeId)) return res.status(400).json({ message: 'Pegawai/teknisi wajib dipilih' })
      const [techRows] = await db.query('SELECT id, role FROM users WHERE id = ? AND is_active = 1', [assigneeId])
      if (!techRows.length || techRows[0].role !== 'user') return res.status(400).json({ message: 'Pegawai tidak valid' })
      targetUserId = assigneeId
    }
  } else {
    if (safeScope === 'all_technicians') return res.status(403).json({ message: 'Hanya admin/sales yang bisa membuat tugas untuk semua teknisi' })
    targetUserId = req.user.id
  }

  if (safeScope === 'single' && !targetUserId) {
    return res.status(400).json({ message: 'User untuk tugas tidak valid' })
  }

  const [result] = await db.query(
    `INSERT INTO tasks
      (user_id, created_by_id, assignment_scope, max_claimants, task_category, title, description, deadline_date, status, started_at, completed_at, start_latitude, start_longitude, start_location_note, start_location_source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      targetUserId,
      createdById,
      safeScope,
      safeScope === 'all_technicians' ? defaultMaxClaimants : 2,
      safeTaskCategory,
      title,
      description,
      deadline_date || null,
      status,
      status === 'in_progress' ? new Date() : null,
      status === 'done' ? new Date() : null,
      latitude,
      longitude,
      location_note,
      location_source,
    ],
  )
  await insertTaskAttachments(result.insertId, req.files, false)
  res.json({ message: 'Tugas berhasil dibuat' })
})

app.put('/api/tasks/:id', authMiddleware(), upload.array('attachments', 10), async (req, res) => {
  const { title, description, deadline_date, status, location_source = null, location_note = null, latitude = null, longitude = null, work_progress_note } = req.body
  const [rows] = await db.query('SELECT * FROM tasks WHERE id=?', [req.params.id])
  const task = rows[0]
  if (!task) return res.status(404).json({ message: 'Tugas tidak ditemukan' })

  const assignee = await isTaskAssignee(req, task)
  const metaEditor = canManageTaskMeta(req, task)

  if (!metaEditor && !assignee) return res.status(403).json({ message: 'Forbidden' })

  if (assignee && !metaEditor) {
    const note = work_progress_note !== undefined ? work_progress_note : task.work_progress_note
    await db.query(`UPDATE tasks SET work_progress_note = ?, updated_at=NOW() WHERE id=?`, [note, req.params.id])
    await insertTaskAttachments(req.params.id, req.files, false)
    return res.json({ message: 'Catatan & lampiran pengerjaan tersimpan' })
  }

  await db.query(
    `UPDATE tasks
     SET title=?,
         description=?,
         deadline_date=?,
         status=?,
         start_latitude = COALESCE(?, start_latitude),
         start_longitude = COALESCE(?, start_longitude),
         start_location_note = COALESCE(?, start_location_note),
         start_location_source = COALESCE(?, start_location_source),
         updated_at=NOW()
     WHERE id=?`,
    [title, description, deadline_date || null, status, latitude, longitude, location_note, location_source, req.params.id],
  )
  await insertTaskAttachments(req.params.id, req.files, false)
  res.json({ message: 'Tugas berhasil diupdate' })
})

app.post('/api/tasks/:id/start', authMiddleware(), async (req, res) => {
  const { latitude = null, longitude = null, location_note = null, location_source = 'manual' } = req.body
  const [rows] = await db.query('SELECT * FROM tasks WHERE id=?', [req.params.id])
  const task = rows[0]
  if (!task) return res.status(404).json({ message: 'Tugas tidak ditemukan' })
  if (req.user.role !== 'admin' && !(await isTaskAssignee(req, task))) return res.status(403).json({ message: 'Forbidden' })
  if (task.completed_at) return res.status(400).json({ message: 'Tugas sudah selesai' })
  if (task.started_at) return res.status(400).json({ message: 'Tugas sudah dimulai' })

  await db.query(
    `UPDATE tasks
     SET started_at = NOW(),
         status = 'in_progress',
         start_latitude = ?,
         start_longitude = ?,
         start_location_note = ?,
         start_location_source = ?,
         updated_at = NOW()
     WHERE id = ?`,
    [latitude, longitude, location_note, location_source, req.params.id],
  )
  res.json({ message: 'Pengerjaan tugas dimulai' })
})

app.post('/api/tasks/:id/finish', authMiddleware(), upload.array('completion_attachments', 10), async (req, res) => {
  const {
    latitude = null,
    longitude = null,
    location_note = null,
    location_source = 'manual',
    completion_report,
  } = req.body
  const report = completion_report !== undefined && completion_report !== null ? String(completion_report).trim() : ''
  const [rows] = await db.query('SELECT * FROM tasks WHERE id=?', [req.params.id])
  const task = rows[0]
  if (!task) return res.status(404).json({ message: 'Tugas tidak ditemukan' })
  if (req.user.role !== 'admin' && !(await isTaskAssignee(req, task))) return res.status(403).json({ message: 'Forbidden' })
  if (!task.started_at) return res.status(400).json({ message: 'Tugas belum dimulai' })
  if (task.completed_at) return res.status(400).json({ message: 'Tugas sudah selesai' })

  if (!report) return res.status(400).json({ message: 'Deskripsi/keterangan penyelesaian wajib diisi' })
  const files = req.files || []
  const imageFiles = files.filter((f) => f.mimetype && f.mimetype.startsWith('image/'))
  if (!imageFiles.length) return res.status(400).json({ message: 'Minimal satu foto bukti penyelesaian wajib diupload' })

  await db.query(
    `UPDATE tasks
     SET completed_at = NOW(),
         status = 'done',
         completion_latitude = ?,
         completion_longitude = ?,
         completion_location_note = ?,
         completion_location_source = ?,
         completion_report = ?,
         updated_at = NOW()
     WHERE id = ?`,
    [latitude, longitude, location_note, location_source, report, req.params.id],
  )
  await insertTaskAttachments(req.params.id, imageFiles, true)
  res.json({ message: 'Pengerjaan tugas selesai' })
})

app.delete('/api/tasks/:id', authMiddleware(), async (req, res) => {
  const [rows] = await db.query('SELECT * FROM tasks WHERE id=?', [req.params.id])
  const task = rows[0]
  if (!task) return res.status(404).json({ message: 'Tugas tidak ditemukan' })
  const allowed =
    req.user.role === 'admin' || (await isTaskAssignee(req, task)) || (req.user.role === 'sales' && task.created_by_id === req.user.id)
  if (!allowed) return res.status(403).json({ message: 'Forbidden' })

  const [attachments] = await db.query('SELECT * FROM task_attachments WHERE task_id=?', [req.params.id])
  attachments.forEach((item) => {
    const filePath = path.join(uploadDir, item.stored_name)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  })
  await db.query('DELETE FROM tasks WHERE id=?', [req.params.id])
  res.json({ message: 'Tugas berhasil dihapus' })
})

app.delete('/api/tasks/:taskId/attachments/:attachmentId', authMiddleware(), async (req, res) => {
  const [attRows] = await db.query(
    `SELECT a.*, t.user_id, t.created_by_id FROM task_attachments a
     JOIN tasks t ON t.id=a.task_id
     WHERE a.id=? AND a.task_id=?`,
    [req.params.attachmentId, req.params.taskId],
  )
  const attachment = attRows[0]
  if (!attachment) return res.status(404).json({ message: 'Attachment tidak ditemukan' })
  const [claimRows] = await db.query('SELECT id FROM task_claims WHERE task_id=? AND user_id=? LIMIT 1', [req.params.taskId, req.user.id])
  const allowed =
    req.user.role === 'admin' ||
    attachment.user_id === req.user.id ||
    Boolean(claimRows.length) ||
    (req.user.role === 'sales' && attachment.created_by_id === req.user.id)
  if (!allowed) return res.status(403).json({ message: 'Forbidden' })

  const filePath = path.join(uploadDir, attachment.stored_name)
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  await db.query('DELETE FROM task_attachments WHERE id=?', [req.params.attachmentId])
  res.json({ message: 'Attachment berhasil dihapus' })
})

app.post('/api/tasks/:id/claim', authMiddleware(['user']), async (req, res) => {
  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    const [taskRows] = await conn.query('SELECT * FROM tasks WHERE id=? FOR UPDATE', [req.params.id])
    const task = taskRows[0]
    if (!task) {
      await conn.rollback()
      return res.status(404).json({ message: 'Tugas tidak ditemukan' })
    }
    if (task.assignment_scope !== 'all_technicians') {
      await conn.rollback()
      return res.status(400).json({ message: 'Tugas ini bukan tipe semua teknisi' })
    }
    if (task.completed_at || task.status === 'cancelled') {
      await conn.rollback()
      return res.status(400).json({ message: 'Tugas ini sudah ditutup' })
    }

    const [myClaim] = await conn.query('SELECT id FROM task_claims WHERE task_id=? AND user_id=? LIMIT 1', [task.id, req.user.id])
    if (myClaim.length) {
      await conn.commit()
      return res.json({ message: 'Tugas sudah pernah kamu ambil' })
    }

    const [claims] = await conn.query(
      `SELECT c.user_id, u.name
       FROM task_claims c
       JOIN users u ON u.id = c.user_id
       WHERE c.task_id=?
       ORDER BY c.claimed_at ASC
       FOR UPDATE`,
      [task.id],
    )
    const limit = task.max_claimants || 2
    if (claims.length >= limit) {
      await conn.rollback()
      return res.status(400).json({ message: `Tugas sudah diambil oleh ${claims.map((c) => c.name).join(', ')}` })
    }

    await conn.query('INSERT INTO task_claims (task_id, user_id) VALUES (?, ?)', [task.id, req.user.id])
    await conn.commit()
    return res.json({ message: 'Tugas berhasil diambil' })
  } catch (error) {
    await conn.rollback()
    return res.status(500).json({ message: error.message })
  } finally {
    conn.release()
  }
})

app.get('/api/customers', authMiddleware(), async (req, res) => {
  const { search = '', page = 1, limit = 10, status = '' } = req.query
  const pg = toPagination(page, limit)
  const offset = (pg.page - 1) * pg.limit
  const where = ['(c.name LIKE ? OR c.phone LIKE ? OR c.address LIKE ?)']
  const params = [`%${search}%`, `%${search}%`, `%${search}%`]
  if (status === 'active' || status === 'inactive') {
    where.push('c.status = ?')
    params.push(status)
  }
  const whereClause = where.join(' AND ')
  const [rows] = await db.query(
    `SELECT c.* FROM customers c WHERE ${whereClause} ORDER BY c.id DESC LIMIT ? OFFSET ?`,
    [...params, pg.limit, offset],
  )
  const [countRows] = await db.query(`SELECT COUNT(*) AS total FROM customers c WHERE ${whereClause}`, params)
  res.json({ data: rows, total: countRows[0].total, page: pg.page, limit: pg.limit })
})

app.post('/api/customers', authMiddleware(), upload.single('photo'), async (req, res) => {
  const { name, phone, address, status = 'active', customer_code = '', customer_password = '' } = req.body
  const nm = String(name || '').trim()
  const ph = String(phone || '').trim()
  const addr = String(address || '').trim()
  const code = String(customer_code || '').trim()
  const password = String(customer_password || '').trim()
  if (!nm || !ph || !addr) return res.status(400).json({ message: 'Nama, nomor telepon, dan alamat wajib diisi' })
  const st = status === 'inactive' ? 'inactive' : 'active'
  const photoUrl = req.file ? buildUploadUrl(req.file.filename) : null
  await db.query('INSERT INTO customers (name, phone, address, status, photo_url, customer_code, customer_password) VALUES (?, ?, ?, ?, ?, ?, ?)', [
    nm,
    ph,
    addr,
    st,
    photoUrl,
    code || null,
    password || null,
  ])
  res.json({ message: 'Pelanggan berhasil ditambah' })
})

app.put('/api/customers/:id', authMiddleware(), upload.single('photo'), async (req, res) => {
  const { name, phone, address, status = 'active', customer_code = '', customer_password = '', keep_existing_photo = '1' } = req.body
  const nm = String(name || '').trim()
  const ph = String(phone || '').trim()
  const addr = String(address || '').trim()
  const code = String(customer_code || '').trim()
  const password = String(customer_password || '').trim()
  if (!nm || !ph || !addr) return res.status(400).json({ message: 'Nama, nomor telepon, dan alamat wajib diisi' })
  const st = status === 'inactive' ? 'inactive' : 'active'
  const [oldRows] = await db.query('SELECT id, photo_url FROM customers WHERE id=? LIMIT 1', [req.params.id])
  if (!oldRows.length) return res.status(404).json({ message: 'Pelanggan tidak ditemukan' })
  const oldPhotoUrl = oldRows[0].photo_url
  const shouldKeepPhoto = String(keep_existing_photo) === '1'
  let nextPhotoUrl = oldPhotoUrl
  if (req.file) {
    nextPhotoUrl = buildUploadUrl(req.file.filename)
  } else if (!shouldKeepPhoto) {
    nextPhotoUrl = null
  }
  const [r] = await db.query(
    'UPDATE customers SET name=?, phone=?, address=?, status=?, photo_url=?, customer_code=?, customer_password=? WHERE id=?',
    [nm, ph, addr, st, nextPhotoUrl, code || null, password || null, req.params.id],
  )
  if (!r.affectedRows) return res.status(404).json({ message: 'Pelanggan tidak ditemukan' })
  if ((req.file || !shouldKeepPhoto) && oldPhotoUrl && oldPhotoUrl !== nextPhotoUrl) {
    const oldPath = resolveUploadPathFromUrl(oldPhotoUrl)
    if (oldPath && fs.existsSync(oldPath)) fs.unlinkSync(oldPath)
  }
  res.json({ message: 'Pelanggan berhasil diupdate' })
})

app.delete('/api/customers/:id', authMiddleware(), async (req, res) => {
  const [oldRows] = await db.query('SELECT id, photo_url FROM customers WHERE id=? LIMIT 1', [req.params.id])
  if (!oldRows.length) return res.status(404).json({ message: 'Pelanggan tidak ditemukan' })
  const [r] = await db.query('DELETE FROM customers WHERE id=?', [req.params.id])
  if (!r.affectedRows) return res.status(404).json({ message: 'Pelanggan tidak ditemukan' })
  const oldPath = resolveUploadPathFromUrl(oldRows[0].photo_url)
  if (oldPath && fs.existsSync(oldPath)) fs.unlinkSync(oldPath)
  res.json({ message: 'Pelanggan berhasil dihapus' })
})

const currentYearMonth = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

app.get('/api/attendance/leave', authMiddleware(), async (req, res) => {
  const { search = '', page = 1, limit = 10, user_id = '', from = '', to = '' } = req.query
  const pg = toPagination(page, limit)
  const offset = (pg.page - 1) * pg.limit
  const where = ['1=1']
  const params = []
  if (req.user.role !== 'admin') {
    where.push('l.user_id = ?')
    params.push(req.user.id)
  } else if (user_id) {
    where.push('l.user_id = ?')
    params.push(user_id)
  }
  if (from) {
    where.push('l.leave_date >= ?')
    params.push(from)
  }
  if (to) {
    where.push('l.leave_date <= ?')
    params.push(to)
  }
  if (search) {
    where.push('(u.name LIKE ? OR u.email LIKE ? OR l.note LIKE ?)')
    const q = `%${search}%`
    params.push(q, q, q)
  }
  const whereClause = where.join(' AND ')
  const [rows] = await db.query(
    `SELECT l.*, u.name AS user_name, u.email AS user_email, u.role AS user_role
     FROM attendance_leaves l
     JOIN users u ON u.id = l.user_id
     WHERE ${whereClause}
     ORDER BY l.leave_date DESC, l.id DESC
     LIMIT ? OFFSET ?`,
    [...params, pg.limit, offset],
  )
  const [countRows] = await db.query(
    `SELECT COUNT(*) AS total
     FROM attendance_leaves l
     JOIN users u ON u.id = l.user_id
     WHERE ${whereClause}`,
    params,
  )
  res.json({ data: rows, total: countRows[0].total, page: pg.page, limit: pg.limit })
})

app.post('/api/attendance/leave', authMiddleware(), async (req, res) => {
  const { leave_date, leave_type, note } = req.body
  const safeType = leave_type === 'permission_late' ? 'permission_late' : 'sick'
  const n = String(note || '').trim()
  if (!n) return res.status(400).json({ message: 'Keterangan izin / sakit / izin telat wajib diisi' })
  if (!leave_date) return res.status(400).json({ message: 'Tanggal wajib diisi' })
  await db.query(
    `INSERT INTO attendance_leaves (user_id, leave_date, leave_type, note)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE leave_type = VALUES(leave_type), note = VALUES(note)`,
    [req.user.id, leave_date, safeType, n],
  )
  const [att] = await db.query(
    'SELECT id, check_in_time, user_id, attendance_date FROM attendance WHERE user_id=? AND attendance_date=? LIMIT 1',
    [req.user.id, leave_date],
  )
  if (att.length && att[0].check_in_time) {
    await applyLatePointsToAttendanceRow(att[0].id, att[0].user_id, formatDateYmd(att[0].attendance_date), att[0].check_in_time)
  }
  res.json({ message: 'Izin berhasil dicatat (0 poin telat untuk hari ini bila ada keterlambatan)' })
})

app.delete('/api/attendance/leave/:id', authMiddleware(), async (req, res) => {
  const [rows] = await db.query('SELECT * FROM attendance_leaves WHERE id=?', [req.params.id])
  if (!rows.length) return res.status(404).json({ message: 'Data izin tidak ditemukan' })
  if (req.user.role !== 'admin' && rows[0].user_id !== req.user.id) return res.status(403).json({ message: 'Forbidden' })
  const { user_id, leave_date } = rows[0]
  await db.query('DELETE FROM attendance_leaves WHERE id=?', [req.params.id])
  const [att] = await db.query(
    'SELECT id, check_in_time, user_id, attendance_date FROM attendance WHERE user_id=? AND attendance_date=? LIMIT 1',
    [user_id, leave_date],
  )
  if (att.length && att[0].check_in_time) {
    await applyLatePointsToAttendanceRow(att[0].id, att[0].user_id, formatDateYmd(att[0].attendance_date), att[0].check_in_time)
  }
  res.json({ message: 'Izin dihapus' })
})

app.get('/api/attendance/late-points/me', authMiddleware(), async (req, res) => {
  const ym = req.query.year_month && /^\d{4}-\d{2}$/.test(req.query.year_month) ? req.query.year_month : currentYearMonth()
  const [[sumRow]] = await db.query(
    `SELECT COALESCE(SUM(late_points), 0) AS total_points
     FROM attendance
     WHERE user_id = ? AND DATE_FORMAT(attendance_date, '%Y-%m') = ?`,
    [req.user.id, ym],
  )
  const [[settingsRow]] = await db.query('SELECT late_penalty_per_point_rupiah FROM settings LIMIT 1')
  const perPoint = Number(settingsRow?.late_penalty_per_point_rupiah ?? 10000)
  const totalPoints = Number(sumRow?.total_points || 0)
  const [breakdown] = await db.query(
    `SELECT id, attendance_date, check_in_time, late_minutes, late_points
     FROM attendance
     WHERE user_id = ? AND DATE_FORMAT(attendance_date, '%Y-%m') = ? AND late_points > 0
     ORDER BY attendance_date DESC, id DESC`,
    [req.user.id, ym],
  )
  res.json({
    year_month: ym,
    total_points: totalPoints,
    penalty_per_point_rupiah: perPoint,
    estimated_penalty_rupiah: totalPoints * perPoint,
    breakdown,
    rules: {
      late_within_hour: 'Telat (≤ 1 jam dari jam masuk) = 1 poin',
      late_over_hour: 'Telat > 1 jam = 2 poin',
      leave_types: 'Izin sakit, izin telat (dengan keterangan) = 0 poin',
    },
  })
})

app.get('/api/attendance/late-points/summary', authMiddleware(['admin']), async (req, res) => {
  const ym = req.query.year_month && /^\d{4}-\d{2}$/.test(req.query.year_month) ? req.query.year_month : currentYearMonth()
  const [rows] = await db.query(
    `SELECT u.id, u.name, u.email, u.role, COALESCE(SUM(a.late_points), 0) AS total_points
     FROM users u
     LEFT JOIN attendance a ON a.user_id = u.id AND DATE_FORMAT(a.attendance_date, '%Y-%m') = ?
     WHERE u.is_active = 1
     GROUP BY u.id, u.name, u.email, u.role
     ORDER BY total_points DESC, u.name ASC`,
    [ym],
  )
  const [[settingsRow]] = await db.query('SELECT late_penalty_per_point_rupiah FROM settings LIMIT 1')
  const perPoint = Number(settingsRow?.late_penalty_per_point_rupiah ?? 10000)
  res.json({ year_month: ym, penalty_per_point_rupiah: perPoint, data: rows })
})

app.post('/api/attendance/late-points/reset-month', authMiddleware(['admin']), async (req, res) => {
  const ym =
    req.body?.year_month && /^\d{4}-\d{2}$/.test(String(req.body.year_month)) ? String(req.body.year_month) : currentYearMonth()
  const [r] = await db.query(`UPDATE attendance SET late_points = 0 WHERE DATE_FORMAT(attendance_date, '%Y-%m') = ?`, [ym])
  res.json({ message: `Poin telat untuk periode ${ym} telah direset`, affected_rows: r.affectedRows })
})

app.get('/api/select/users', authMiddleware(['admin', 'sales']), async (req, res) => {
  const { search = '' } = req.query
  const [rows] = await db.query('SELECT id, name FROM users WHERE role="user" AND name LIKE ? ORDER BY name ASC LIMIT 20', [`%${search}%`])
  res.json(rows)
})

app.use((error, _, res, __) => {
  res.status(500).json({ message: error.message || 'Internal server error' })
})

ensureTaskSchema()
  .then(() => ensureCustomersLeavesLateSchema())
  .then(() => ensureOfficesSchema())
  .then(() => ensureCustomersExtraColumns())
  .then(() => {
    coreLateSchemaPromise = Promise.resolve()
    app.listen(PORT, () => {
      console.log(`API running on http://localhost:${PORT}`)
    })
  })
  .catch((error) => {
    console.error('Failed to ensure DB schema', error.message, error.sqlMessage || '', error.code || '')
    if (error?.stack) console.error(error.stack)
    process.exit(1)
  })
