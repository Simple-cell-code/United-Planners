CREATE DATABASE IF NOT EXISTS united_planners;
USE united_planners;

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
);

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
);

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
);

CREATE TABLE IF NOT EXISTS events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  type VARCHAR(80) NOT NULL,
  description TEXT,
  date DATE NOT NULL,
  start_time VARCHAR(20) NOT NULL,
  end_time VARCHAR(20) NOT NULL,
  venue VARCHAR(200) NOT NULL,
  location VARCHAR(200) NOT NULL,
  organizer VARCHAR(200) NOT NULL,
  email VARCHAR(255) NOT NULL,
  dress_code VARCHAR(120),
  status ENUM('LIVE', 'STARTING SOON', 'UPCOMING', 'COMPLETED', 'CANCELLED', 'PENDING') DEFAULT 'PENDING',
  approval ENUM('Approved', 'Pending', 'Rejected') DEFAULT 'Pending',
  attendees INT DEFAULT 0,
  price VARCHAR(120),
  registration VARCHAR(200),
  image_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS announcements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sender VARCHAR(120) NOT NULL,
  sender_title VARCHAR(120) NOT NULL,
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO users (name, email, password, role, user_code)
SELECT 'Fai Atula', 'admin@unitedplanners.com', '$2a$10$q0hwsvXjRHDHNQmp58mWSuOTATP9etbK3SNU2I9iE3XoGmhD5A.Xi', 'admin', 'UP-ADMIN-001'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'admin@unitedplanners.com');

INSERT INTO users (name, email, password, role, user_code)
SELECT 'United Planners Guest', 'member@unitedplanners.com', '$2a$10$Gx2lorUMoKTEYuPxpAFeWecXw4qsWPbCqOe3XW8Dd.r4g7zmVnib.', 'member', 'UP-MEMBER-001'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'member@unitedplanners.com');
