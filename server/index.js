import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { createHash, randomBytes, randomInt } from 'node:crypto';

dotenv.config();

const app = express();
const preferredPort = Number(process.env.PORT || 4000);
const JWT_SECRET = process.env.JWT_SECRET || 'UnitedPlannersJWT2026SecureSecretKey!';
const activeUsers = new Map();
const activeUserWindowMs = 60_000;
const resetRequestTimes = new Map();
const emailChangeRequestTimes = new Map();
const resetRequestWindowMs = 60_000;
const resetCodeTtlMinutes = 10;
const resetCodeMaxAttempts = 5;
const profilePictureMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const maxProfilePictureBytes = 5 * 1024 * 1024;

const createUserCode = () => `UP-${randomBytes(6).toString('hex').toUpperCase()}`;
const hashResetCode = (code) => createHash('sha256').update(code).digest('hex');

const createMailTransporter = () => {
  const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
  const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
  const SMTP_USER = process.env.SMTP_USER;
  const SMTP_PASSWORD = process.env.SMTP_PASSWORD;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) {
    throw new Error('Add your Gmail address and Google App Password as SMTP_USER and SMTP_PASSWORD in .env to enable password reset email.');
  }
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: process.env.SMTP_SECURE === undefined ? SMTP_PORT === 465 : process.env.SMTP_SECURE === 'true',
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
  });
};

const buildUserResponse = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  userCode: user.user_code || user.userCode,
  isBlocked: Boolean(user.is_blocked ?? user.isBlocked),
});

const buildProfilePictureDataUrl = (picture) => {
  const mimeType = picture.avatar_mime_type;
  const data = picture.avatar_data;
  if (!data || !profilePictureMimeTypes.has(mimeType)) return null;
  return `data:${mimeType};base64,${Buffer.from(data).toString('base64')}`;
};

const isValidProfilePicture = (mimeType, data) => {
  if (!Buffer.isBuffer(data) || data.length === 0 || data.length > maxProfilePictureBytes) return false;
  if (mimeType === 'image/jpeg') return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  if (mimeType === 'image/png') return data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === 'image/webp') return data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP';
  return false;
};

const signToken = (user) => jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role, userCode: user.userCode }, JWT_SECRET, { expiresIn: '12h' });

const extractToken = (req) => {
  const header = req.headers.authorization || '';
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.replace('Bearer ', '').trim();
  }

  const fallback = req.headers['x-auth-token'];
  return typeof fallback === 'string' ? fallback.trim() : null;
};

const requireAuth = async (req, res, next) => {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch (_error) {
    return res.status(401).json({ error: 'Session expired or invalid.' });
  }

  try {
    const pool = await getPool();
    const [rows] = await pool.query('SELECT id, name, email, role, user_code, is_blocked FROM users WHERE id = ?', [payload.id]);
    await pool.end();
    if (!rows.length) return res.status(401).json({ error: 'Account not found.' });
    if (rows[0].is_blocked) return res.status(403).json({ code: 'ACCOUNT_BLOCKED', error: 'This account has been blocked from the service.' });
    req.user = { ...payload, id: rows[0].id, name: rows[0].name, email: rows[0].email, role: rows[0].role, userCode: rows[0].user_code };
    return next();
  } catch (_error) {
    return res.status(503).json({ error: 'Unable to verify your account. Please try again.' });
  }
};

const requireRole = (role) => (req, res, next) => {
  if (!req.user || req.user.role !== role) {
    return res.status(403).json({ error: 'Forbidden. Admin access required.' });
  }

  return next();
};

const startServer = (portToUse) => {
  const server = app.listen(portToUse, async () => {
    try {
      await ensureUsersTable();
      console.log(`United Planners auth server running on http://localhost:${portToUse}`);
    } catch (error) {
      console.warn('MySQL not connected yet. Auth endpoints will return configuration errors until the database is set up.');
      console.warn(error.message);
      console.log(`United Planners auth server running on http://localhost:${portToUse}`);
    }
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE' && portToUse === preferredPort) {
      console.warn(`Port ${preferredPort} is already in use. Retrying on ${preferredPort + 1}.`);
      startServer(preferredPort + 1);
      return;
    }
    throw error;
  });
};

app.use(cors());
app.use(express.json());

const getPool = async () => {
  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;

  if (!DB_HOST || !DB_USER || !DB_NAME) {
    throw new Error('MySQL environment variables are missing. Check the .env file or .env.example.');
  }

  return mysql.createPool({
    host: DB_HOST,
    port: Number(DB_PORT || 3306),
    user: DB_USER,
    password: DB_PASSWORD || '',
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });
};

const seededAccounts = [
  { email: 'admin@unitedplanners.com', name: 'Fai Atula', password: 'admin1234', role: 'admin' },
  { email: 'member@unitedplanners.com', name: 'United Planners Guest', password: 'member1234', role: 'member' },
];

const ensureUserColumns = async (pool) => {
  const [userCodeColumns] = await pool.query("SHOW COLUMNS FROM users LIKE 'user_code'");
  if (!userCodeColumns.length) await pool.query('ALTER TABLE users ADD COLUMN user_code VARCHAR(24) NULL UNIQUE');
  const [blockedColumns] = await pool.query("SHOW COLUMNS FROM users LIKE 'is_blocked'");
  if (!blockedColumns.length) await pool.query('ALTER TABLE users ADD COLUMN is_blocked BOOLEAN NOT NULL DEFAULT FALSE');
  const [avatarDataColumns] = await pool.query("SHOW COLUMNS FROM users LIKE 'avatar_data'");
  if (!avatarDataColumns.length) await pool.query('ALTER TABLE users ADD COLUMN avatar_data MEDIUMBLOB NULL');
  const [avatarMimeTypeColumns] = await pool.query("SHOW COLUMNS FROM users LIKE 'avatar_mime_type'");
  if (!avatarMimeTypeColumns.length) await pool.query('ALTER TABLE users ADD COLUMN avatar_mime_type VARCHAR(32) NULL');
  const [missingCodes] = await pool.query('SELECT id FROM users WHERE user_code IS NULL OR user_code = ? LIMIT 1000', ['']);
  for (const user of missingCodes) {
    await pool.query('UPDATE users SET user_code = ? WHERE id = ?', [createUserCode(), user.id]);
  }
  if (missingCodes.length) await pool.query('ALTER TABLE users MODIFY user_code VARCHAR(24) NOT NULL');
};

const ensureUsersTable = async () => {
  const pool = await getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      role ENUM('admin', 'member') NOT NULL DEFAULT 'member',
      user_code VARCHAR(24) NOT NULL UNIQUE,
      is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
      avatar_data MEDIUMBLOB NULL,
      avatar_mime_type VARCHAR(32) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await ensureUserColumns(pool);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_resets (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      code_hash CHAR(64) NOT NULL,
      expires_at DATETIME NOT NULL,
      attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
      used_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_password_resets_user_created (user_id, created_at),
      CONSTRAINT fk_password_resets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_change_verifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      new_email VARCHAR(255) NOT NULL,
      code_hash CHAR(64) NOT NULL,
      expires_at DATETIME NOT NULL,
      attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
      used_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_email_change_user_created (user_id, created_at),
      CONSTRAINT fk_email_change_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  for (const account of seededAccounts) {
    const [rows] = await pool.query('SELECT id, password, role, user_code FROM users WHERE email = ?', [account.email]);

    if (!rows.length) {
      const passwordHash = await bcrypt.hash(account.password, 10);
      await pool.query('INSERT INTO users (name, email, password, role, user_code) VALUES (?, ?, ?, ?, ?)', [account.name, account.email, passwordHash, account.role, createUserCode()]);
      continue;
    }

    const existingUser = rows[0];
    const passwordMatches = await bcrypt.compare(account.password, existingUser.password).catch(() => false);
    if (!passwordMatches || existingUser.role !== account.role) {
      const passwordHash = await bcrypt.hash(account.password, 10);
      await pool.query('UPDATE users SET name = ?, password = ?, role = ? WHERE email = ?', [account.name, passwordHash, account.role, account.email]);
    }
  }

  await pool.end();
};

app.get('/health', async (_req, res) => {
  try {
    await getPool();
    res.json({ ok: true, status: 'MySQL-ready' });
  } catch (error) {
    res.status(503).json({ ok: false, status: 'MySQL configuration missing', message: error.message });
  }
});

app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body || {};

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  }

  try {
    const pool = await getPool();
    const normalizedEmail = String(email).trim().toLowerCase();
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
    if (existing.length) {
      return res.status(409).json({ error: 'A user with that email already exists.' });
    }

    const hash = await bcrypt.hash(String(password), 10);
    const userCode = createUserCode();
    const [result] = await pool.query('INSERT INTO users (name, email, password, role, user_code) VALUES (?, ?, ?, ?, ?)', [String(name).trim(), normalizedEmail, hash, 'member', userCode]);
    await pool.end();

    const user = { id: result.insertId, name: String(name).trim(), email: normalizedEmail, role: 'member', userCode };
    return res.status(201).json({ ...user, token: signToken(user) });
  } catch (error) {
    return res.status(500).json({ error: 'Unable to create the user. Check your MySQL configuration.', detail: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const pool = await getPool();
    const normalizedEmail = String(email).trim().toLowerCase();
    const [rows] = await pool.query('SELECT id, name, email, password, role, user_code, is_blocked FROM users WHERE email = ?', [normalizedEmail]);
    await pool.end();

    if (!rows.length) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const user = rows[0];
    const isValid = await bcrypt.compare(String(password), user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }
    if (user.is_blocked) {
      return res.status(403).json({ code: 'ACCOUNT_BLOCKED', error: 'This account has been blocked from the service.' });
    }

    const safeUser = buildUserResponse(user);
    return res.json({ ...safeUser, token: signToken(safeUser) });
  } catch (error) {
    return res.status(500).json({ error: 'Unable to authenticate. Check your MySQL configuration.', detail: error.message });
  }
});

app.post('/api/auth/forgot-password', async (req, res) => {
  const normalizedEmail = String(req.body?.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }

  const limiterKey = `${req.ip}:${normalizedEmail}`;
  const lastRequestAt = resetRequestTimes.get(limiterKey) || 0;
  if (Date.now() - lastRequestAt < resetRequestWindowMs) {
    return res.json({ message: 'If an account exists for that email, a reset code has been sent.' });
  }
  resetRequestTimes.set(limiterKey, Date.now());
  for (const [key, time] of resetRequestTimes) {
    if (Date.now() - time > resetRequestWindowMs * 5) resetRequestTimes.delete(key);
  }

  let transporter;
  try {
    transporter = createMailTransporter();
  } catch (error) {
    return res.status(503).json({ error: error.message });
  }

  let pool;
  try {
    pool = await getPool();
    const [users] = await pool.query('SELECT id, name FROM users WHERE email = ? LIMIT 1', [normalizedEmail]);
    if (!users.length) {
      await pool.end();
      return res.json({ message: 'If an account exists for that email, a reset code has been sent.' });
    }

    const code = String(randomInt(100000, 1000000));
    await pool.query('UPDATE password_resets SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL', [users[0].id]);
    await pool.query('INSERT INTO password_resets (user_id, code_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))', [users[0].id, hashResetCode(code), resetCodeTtlMinutes]);
    await pool.end();
    pool = null;

    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: normalizedEmail,
      subject: 'Your United Planners password reset code',
      text: `Hello ${users[0].name},\n\nYour password reset code is ${code}. It expires in ${resetCodeTtlMinutes} minutes and can be used once. If you did not request this code, ignore this email.`,
      html: `<p>Hello ${String(users[0].name).replace(/[&<>"']/g, '')},</p><p>Your United Planners password reset code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>It expires in ${resetCodeTtlMinutes} minutes and can be used once. If you did not request this code, ignore this email.</p>`,
    });
    return res.json({ message: 'If an account exists for that email, a reset code has been sent.' });
  } catch (error) {
    if (pool) await pool.end().catch(() => undefined);
    console.error('Password reset request failed:', error.message);
    return res.status(503).json({ error: 'Unable to send a reset code right now. Please try again later.' });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const code = String(req.body?.code || '').trim();
  const password = String(req.body?.password || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{6}$/.test(code) || password.length < 8) {
    return res.status(400).json({ error: 'Enter the six-digit email code and a password with at least 8 characters.' });
  }

  let pool;
  let connection;
  try {
    pool = await getPool();
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [rows] = await connection.query(`
      SELECT resets.id, resets.user_id
      FROM password_resets AS resets
      INNER JOIN users ON users.id = resets.user_id
      WHERE users.email = ? AND resets.code_hash = ? AND resets.used_at IS NULL
        AND resets.expires_at > NOW() AND resets.attempts < ?
      ORDER BY resets.created_at DESC
      LIMIT 1 FOR UPDATE
    `, [email, hashResetCode(code), resetCodeMaxAttempts]);

    if (!rows.length) {
      await connection.query(`
        UPDATE password_resets AS resets
        INNER JOIN users ON users.id = resets.user_id
        SET resets.attempts = resets.attempts + 1
        WHERE users.email = ? AND resets.used_at IS NULL AND resets.expires_at > NOW() AND resets.attempts < ?
      `, [email, resetCodeMaxAttempts]);
      await connection.commit();
      return res.status(400).json({ error: 'That reset code is invalid or expired. Request a new code and try again.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await connection.query('UPDATE users SET password = ? WHERE id = ?', [passwordHash, rows[0].user_id]);
    await connection.query('UPDATE password_resets SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL', [rows[0].user_id]);
    await connection.commit();
    return res.json({ message: 'Your password has been reset. You can now sign in.' });
  } catch (error) {
    if (connection) await connection.rollback().catch(() => undefined);
    console.error('Password reset failed:', error.message);
    return res.status(503).json({ error: 'Unable to reset the password right now. Please try again later.' });
  } finally {
    connection?.release();
    await pool?.end().catch(() => undefined);
  }
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  const payload = req.user || {};
  if (!payload.id) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  return res.json(buildUserResponse(payload));
});

app.get('/api/auth/me/avatar', requireAuth, async (req, res) => {
  let pool;
  try {
    pool = await getPool();
    const [rows] = await pool.query('SELECT avatar_data, avatar_mime_type FROM users WHERE id = ?', [req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'Account not found.' });
    return res.json({ avatar: buildProfilePictureDataUrl(rows[0]) });
  } catch (error) {
    console.error('Profile picture lookup failed:', error.message);
    return res.status(503).json({ error: 'Unable to load the profile picture right now.' });
  } finally {
    await pool?.end().catch(() => undefined);
  }
});

app.put('/api/auth/me/avatar', requireAuth, express.raw({ type: [...profilePictureMimeTypes], limit: maxProfilePictureBytes }), async (req, res) => {
  const mimeType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (!profilePictureMimeTypes.has(mimeType)) {
    return res.status(415).json({ error: 'Choose a JPEG, PNG, or WebP image for your profile picture.' });
  }
  if (!isValidProfilePicture(mimeType, req.body)) {
    return res.status(400).json({ error: 'The image is empty, invalid, or larger than 5 MB.' });
  }

  let pool;
  try {
    pool = await getPool();
    await pool.query('UPDATE users SET avatar_data = ?, avatar_mime_type = ? WHERE id = ?', [req.body, mimeType, req.user.id]);
    return res.json({ ok: true, avatar: buildProfilePictureDataUrl({ avatar_data: req.body, avatar_mime_type: mimeType }) });
  } catch (error) {
    console.error('Profile picture upload failed:', error.message);
    return res.status(503).json({ error: 'Unable to save the profile picture right now.' });
  } finally {
    await pool?.end().catch(() => undefined);
  }
});

app.post('/api/auth/email/change/request', requireAuth, async (req, res) => {
  const newEmail = String(req.body?.email || '').trim().toLowerCase();
  const currentPassword = String(req.body?.currentPassword || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail) || !currentPassword) {
    return res.status(400).json({ error: 'Enter a valid email address and your current password.' });
  }

  const lastRequestAt = emailChangeRequestTimes.get(Number(req.user.id)) || 0;
  if (Date.now() - lastRequestAt < resetRequestWindowMs) {
    return res.status(429).json({ error: 'Please wait a minute before requesting another verification code.' });
  }

  let pool;
  try {
    pool = await getPool();
    const [rows] = await pool.query('SELECT id, email, password FROM users WHERE id = ? LIMIT 1', [req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'Account not found.' });
    const account = rows[0];
    if (!await bcrypt.compare(currentPassword, account.password)) {
      return res.status(401).json({ error: 'Your current password is incorrect.' });
    }
    if (account.email.toLowerCase() === newEmail) {
      return res.status(400).json({ error: 'That is already the email address on this account.' });
    }

    const [existing] = await pool.query('SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1', [newEmail, req.user.id]);
    if (existing.length) return res.status(409).json({ error: 'That email address is already used by another account.' });

    let transporter;
    try {
      transporter = createMailTransporter();
    } catch (error) {
      return res.status(503).json({ error: error.message });
    }

    const code = String(randomInt(100000, 1000000));
    await pool.query('UPDATE email_change_verifications SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL', [req.user.id]);
    await pool.query('INSERT INTO email_change_verifications (user_id, new_email, code_hash, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))', [req.user.id, newEmail, hashResetCode(code), resetCodeTtlMinutes]);
    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: newEmail,
        subject: 'Verify your new United Planners email',
        text: `Your email verification code is ${code}. It expires in ${resetCodeTtlMinutes} minutes and can only be used once. If you did not request this change, you can ignore this email.`,
        html: `<p>Use this code to verify your new United Planners email:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>It expires in ${resetCodeTtlMinutes} minutes and can only be used once. If you did not request this change, ignore this email.</p>`,
      });
    } catch (error) {
      await pool.query('UPDATE email_change_verifications SET used_at = NOW() WHERE user_id = ? AND code_hash = ?', [req.user.id, hashResetCode(code)]);
      throw error;
    }
    emailChangeRequestTimes.set(Number(req.user.id), Date.now());
    return res.json({ message: `A verification code was sent to ${newEmail}.` });
  } catch (error) {
    console.error('Email change code request failed:', error.message);
    return res.status(503).json({ error: 'Unable to send a verification code right now. Please try again.' });
  } finally {
    await pool?.end().catch(() => undefined);
  }
});

app.post('/api/auth/email/change/verify', requireAuth, async (req, res) => {
  const newEmail = String(req.body?.email || '').trim().toLowerCase();
  const code = String(req.body?.code || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail) || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: 'Enter the new email address and its six-digit verification code.' });
  }

  let pool;
  let connection;
  try {
    pool = await getPool();
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [rows] = await connection.query(`
      SELECT id, new_email
      FROM email_change_verifications
      WHERE user_id = ? AND new_email = ? AND code_hash = ? AND used_at IS NULL
        AND expires_at > NOW() AND attempts < ?
      ORDER BY created_at DESC
      LIMIT 1 FOR UPDATE
    `, [req.user.id, newEmail, hashResetCode(code), resetCodeMaxAttempts]);

    if (!rows.length) {
      await connection.query(`
        UPDATE email_change_verifications
        SET attempts = attempts + 1
        WHERE user_id = ? AND new_email = ? AND used_at IS NULL AND expires_at > NOW() AND attempts < ?
      `, [req.user.id, newEmail, resetCodeMaxAttempts]);
      await connection.commit();
      return res.status(400).json({ error: 'That code is invalid or expired. Request a new code and try again.' });
    }

    const [existing] = await connection.query('SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1', [newEmail, req.user.id]);
    if (existing.length) {
      await connection.query('UPDATE email_change_verifications SET used_at = NOW() WHERE id = ?', [rows[0].id]);
      await connection.commit();
      return res.status(409).json({ error: 'That email address is already used by another account.' });
    }

    await connection.query('UPDATE users SET email = ? WHERE id = ?', [newEmail, req.user.id]);
    await connection.query('UPDATE email_change_verifications SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL', [req.user.id]);
    await connection.commit();
    return res.json({ email: newEmail });
  } catch (error) {
    if (connection) await connection.rollback().catch(() => undefined);
    console.error('Email change verification failed:', error.message);
    return res.status(503).json({ error: 'Unable to verify the new email right now. Please try again.' });
  } finally {
    connection?.release();
    await pool?.end().catch(() => undefined);
  }
});

app.post('/api/presence/heartbeat', requireAuth, (req, res) => {
  activeUsers.set(Number(req.user.id), Date.now());
  res.json({ ok: true });
});

app.get('/api/admin/users', requireAuth, requireRole('admin'), async (_req, res) => {
  try {
    const pool = await getPool();
    const [rows] = await pool.query('SELECT id, name, email, role, user_code, is_blocked, created_at FROM users ORDER BY created_at DESC');
    await pool.end();
    const cutoff = Date.now() - activeUserWindowMs;
    for (const [userId, lastSeen] of activeUsers) {
      if (lastSeen < cutoff) activeUsers.delete(userId);
    }
    const users = rows.map(user => ({ ...buildUserResponse(user), createdAt: user.created_at, active: activeUsers.has(user.id) }));
    res.json({ users, activeCount: [...activeUsers.keys()].filter(id => rows.some(user => user.id === id)).length });
  } catch (error) {
    res.status(500).json({ error: 'Unable to load registered users.', detail: error.message });
  }
});

app.patch('/api/admin/users/:id/block', requireAuth, requireRole('admin'), async (req, res) => {
  const userId = Number(req.params.id);
  const isBlocked = req.body?.isBlocked;
  if (!Number.isInteger(userId) || typeof isBlocked !== 'boolean') {
    return res.status(400).json({ error: 'A user id and blocked status are required.' });
  }
  try {
    const pool = await getPool();
    const [rows] = await pool.query('SELECT id, role FROM users WHERE id = ?', [userId]);
    if (!rows.length) {
      await pool.end();
      return res.status(404).json({ error: 'User not found.' });
    }
    if (rows[0].role === 'admin') {
      await pool.end();
      return res.status(403).json({ error: 'Admin accounts cannot be blocked from this screen.' });
    }
    await pool.query('UPDATE users SET is_blocked = ? WHERE id = ?', [isBlocked, userId]);
    await pool.end();
    if (isBlocked) activeUsers.delete(userId);
    res.json({ ok: true, isBlocked });
  } catch (error) {
    res.status(500).json({ error: 'Unable to update the user account.', detail: error.message });
  }
});

app.post('/api/admin/create-admin', requireAuth, requireRole('admin'), async (req, res) => {
  const { name, email, password } = req.body || {};

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  }

  try {
    const pool = await getPool();
    const normalizedEmail = String(email).trim().toLowerCase();
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
    if (existing.length) {
      return res.status(409).json({ error: 'A user with that email already exists.' });
    }

    const hash = await bcrypt.hash(String(password), 10);
    const userCode = createUserCode();
    const [result] = await pool.query('INSERT INTO users (name, email, password, role, user_code) VALUES (?, ?, ?, ?, ?)', [String(name).trim(), normalizedEmail, hash, 'admin', userCode]);
    await pool.end();

    const user = { id: result.insertId, name: String(name).trim(), email: normalizedEmail, role: 'admin', userCode };
    return res.status(201).json({ ...user, token: signToken(user) });
  } catch (error) {
    return res.status(500).json({ error: 'Unable to create the admin account. Check your MySQL configuration.', detail: error.message });
  }
});

startServer(preferredPort);
