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
  const [rows] = await db.query('SELECT id FROM settings LIMIT 1')
  if (rows.length) {
    await db.query(
      `UPDATE settings SET office_name=?, office_latitude=?, office_longitude=?, office_radius_meter=?, check_in_time=?, check_out_time=?, default_task_max_claimants=?, updated_at=NOW() WHERE id=?`,
      [office_name, office_latitude, office_longitude, office_radius_meter, check_in_time, check_out_time, defaultTaskMaxClaimants, rows[0].id],
    )
  } else {
    await db.query(
      `INSERT INTO settings (office_name, office_latitude, office_longitude, office_radius_meter, check_in_time, check_out_time, default_task_max_claimants) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [office_name, office_latitude, office_longitude, office_radius_meter, check_in_time, check_out_time, defaultTaskMaxClaimants],
    )
  }
  res.json({ message: 'Settings berhasil disimpan' })
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
  const query = `SELECT a.*, u.name AS user_name, u.email AS user_email
                 FROM attendance a
                 JOIN users u ON u.id = a.user_id
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
  const [settingsRows] = await db.query('SELECT * FROM settings LIMIT 1')
  const settings = settingsRows[0]
  const attendanceDate = new Date()
  const dateString = attendanceDate.toISOString().slice(0, 10)

  let gpsStatus = 'OFF'
  let distanceKm = null
  if (latitude !== null && longitude !== null && settings?.office_latitude !== null && settings?.office_longitude !== null) {
    gpsStatus = 'ON'
    distanceKm = haversineKm(Number(latitude), Number(longitude), Number(settings.office_latitude), Number(settings.office_longitude))
  }
  const withinOfficeRadius =
    distanceKm !== null && settings?.office_radius_meter ? distanceKm * 1000 <= Number(settings.office_radius_meter) : null

  const [existingRows] = await db.query('SELECT id FROM attendance WHERE user_id = ? AND DATE(attendance_date) = ?', [req.user.id, dateString])
  if (existingRows.length) return res.status(400).json({ message: 'Check-in hari ini sudah ada' })

  await db.query(
    `INSERT INTO attendance
     (user_id, attendance_date, check_in_time, check_in_latitude, check_in_longitude, gps_status_check_in, location_note_check_in, distance_km_check_in, in_radius_check_in)
     VALUES (?, CURDATE(), NOW(), ?, ?, ?, ?, ?, ?)`,
    [req.user.id, latitude, longitude, gpsStatus, location_note, distanceKm, withinOfficeRadius],
  )
  res.json({ message: 'Check-in berhasil' })
})

app.post('/api/attendance/check-out', authMiddleware(), async (req, res) => {
  const { latitude = null, longitude = null, location_note = null } = req.body
  const dateString = new Date().toISOString().slice(0, 10)
  const [settingsRows] = await db.query('SELECT * FROM settings LIMIT 1')
  const settings = settingsRows[0]
  const [rows] = await db.query('SELECT * FROM attendance WHERE user_id = ? AND DATE(attendance_date) = ?', [req.user.id, dateString])
  if (!rows.length) return res.status(400).json({ message: 'Belum check-in hari ini' })
  if (rows[0].check_out_time) return res.status(400).json({ message: 'Sudah check-out hari ini' })

  let gpsStatus = 'OFF'
  let distanceKm = null
  if (latitude !== null && longitude !== null && settings?.office_latitude !== null && settings?.office_longitude !== null) {
    gpsStatus = 'ON'
    distanceKm = haversineKm(Number(latitude), Number(longitude), Number(settings.office_latitude), Number(settings.office_longitude))
  }
  const withinOfficeRadius =
    distanceKm !== null && settings?.office_radius_meter ? distanceKm * 1000 <= Number(settings.office_radius_meter) : null

  await db.query(
    `UPDATE attendance
     SET check_out_time = NOW(),
         check_out_latitude = ?,
         check_out_longitude = ?,
         gps_status_check_out = ?,
         location_note_check_out = ?,
         distance_km_check_out = ?,
         in_radius_check_out = ?
     WHERE id = ?`,
    [latitude, longitude, gpsStatus, location_note, distanceKm, withinOfficeRadius, rows[0].id],
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

app.get('/api/select/users', authMiddleware(['admin', 'sales']), async (req, res) => {
  const { search = '' } = req.query
  const [rows] = await db.query('SELECT id, name FROM users WHERE role="user" AND name LIKE ? ORDER BY name ASC LIMIT 20', [`%${search}%`])
  res.json(rows)
})

app.use((error, _, res, __) => {
  res.status(500).json({ message: error.message || 'Internal server error' })
})

ensureTaskSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`API running on http://localhost:${PORT}`)
    })
  })
  .catch((error) => {
    console.error('Failed to ensure DB schema', error.message)
    process.exit(1)
  })
