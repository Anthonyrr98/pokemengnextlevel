/**
 * 重置指定用户的密码（忘记密码时使用）
 * 用法：在 backend 目录下执行
 *   node scripts/reset-password.js <用户名> <新密码>
 * 示例：node scripts/reset-password.js myuser mynewpass123
 *
 * 需要先配置 backend/.env 中的 DATABASE_URL。
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');
const crypto = require('crypto');
const { URL } = require('url');

const DATABASE_URL = process.env.DATABASE_URL;

function createPoolFromUrl(urlString) {
  const url = new URL(urlString);
  return mysql.createPool({
    host: url.hostname,
    port: parseInt(url.port) || 3306,
    user: url.username,
    password: url.password,
    database: url.pathname.slice(1),
    waitForConnections: true,
    connectionLimit: 5,
  });
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

async function main() {
  const username = process.argv[2];
  const newPassword = process.argv[3];

  if (!username || !newPassword) {
    console.error('用法: node scripts/reset-password.js <用户名> <新密码>');
    console.error('示例: node scripts/reset-password.js myuser mynewpass123');
    process.exit(1);
  }

  if (newPassword.length < 6) {
    console.error('错误: 新密码长度至少为 6 个字符');
    process.exit(1);
  }

  if (!DATABASE_URL) {
    console.error('错误: 未配置 DATABASE_URL，请在 backend/.env 中设置');
    process.exit(1);
  }

  const pool = createPoolFromUrl(DATABASE_URL);
  const conn = await pool.getConnection();

  try {
    const [rows] = await conn.query(
      'SELECT id, username FROM `User` WHERE username = ? LIMIT 1',
      [username]
    );

    if (rows.length === 0) {
      console.error('错误: 用户不存在:', username);
      process.exit(1);
    }

    const hash = hashPassword(newPassword);
    await conn.query('UPDATE `User` SET password = ?, updatedAt = NOW() WHERE username = ?', [
      hash,
      username,
    ]);

    console.log('密码已重置成功！');
    console.log('用户名:', username);
    console.log('请使用新密码登录游戏。');
  } catch (err) {
    console.error('重置失败:', err.message);
    process.exit(1);
  } finally {
    conn.release();
    await pool.end();
  }
}

main();
