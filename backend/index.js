const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const { URL } = require('url');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;

// CORS 配置
// 生产环境建议限制允许的域名
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['*']; // 默认允许所有（开发环境）

app.use(cors({
  origin: function (origin, callback) {
    // 允许无 origin 的请求（如移动应用、Postman）
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json());

// 从 DATABASE_URL 创建 MySQL 连接池
function createPoolFromUrl(urlString) {
  const url = new URL(urlString);
  return mysql.createPool({
    host: url.hostname,
    port: parseInt(url.port) || 3306,
    user: url.username,
    password: url.password,
    database: url.pathname.slice(1), // 移除前导 '/'
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });
}

const DATABASE_URL = process.env.DATABASE_URL;
const pool = DATABASE_URL ? createPoolFromUrl(DATABASE_URL) : null;

// 密码哈希函数（使用 Node.js 内置 crypto）
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// 验证密码
function verifyPassword(password, hash) {
  return hashPassword(password) === hash;
}

// 生成简单的 token（实际生产环境应使用 JWT）
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// 根据环境变量确保管理员账号存在（ADMIN_USERNAME + ADMIN_PASSWORD）
async function ensureAdminUser() {
  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminUsername || !adminPassword || !pool) return;
  let conn;
  try {
    conn = await pool.getConnection();
    try {
      await conn.query('SELECT isAdmin FROM `User` LIMIT 1');
    } catch (colErr) {
      if (colErr.code === 'ER_BAD_FIELD_ERROR' || (colErr.message && colErr.message.includes('isAdmin'))) {
        await conn.query('ALTER TABLE `User` ADD COLUMN `isAdmin` TINYINT(1) NOT NULL DEFAULT 0');
      } else throw colErr;
    }
    const [rows] = await conn.query('SELECT id, isAdmin FROM `User` WHERE username = ? LIMIT 1', [adminUsername]);
    const hash = hashPassword(adminPassword);
    if (rows.length === 0) {
      await conn.query('INSERT INTO `User` (username, password, isAdmin, createdAt, updatedAt) VALUES (?, ?, 1, NOW(), NOW())', [adminUsername, hash]);
      console.log('[Admin] Created admin user:', adminUsername);
    } else if (!rows[0].isAdmin) {
      await conn.query('UPDATE `User` SET isAdmin = 1 WHERE username = ?', [adminUsername]);
      console.log('[Admin] Set admin privilege for:', adminUsername);
    }
  } catch (e) {
    console.error('[Admin] ensureAdminUser error:', e.message);
  } finally {
    if (conn) conn.release();
  }
}

// 健康检查（/health 用于本地，/api/health 用于 Vercel 等部署）
const healthHandler = async (req, res) => {
  if (!pool) {
    return res.status(503).json({ error: 'Database not configured' });
  }
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    res.status(503).json({ error: 'Database connection failed', message: error.message });
  }
};
app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

// 注册接口
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }

  if (username.length < 3 || username.length > 20) {
    return res.status(400).json({ error: '用户名长度必须在 3-20 个字符之间' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: '密码长度至少为 6 个字符' });
  }

  if (!pool) {
    return res.status(503).json({ error: '数据库未配置' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 检查用户名是否已存在
    const [existingUsers] = await conn.query(
      'SELECT id FROM `User` WHERE username = ? LIMIT 1',
      [username]
    );

    if (existingUsers.length > 0) {
      await conn.rollback();
      return res.status(409).json({ error: '用户名已存在' });
    }

    // 创建新用户（默认非管理员），兼容 Prisma 的 createdAt/updatedAt
    const passwordHash = hashPassword(password);
    let result;
    try {
      [result] = await conn.query(
        'INSERT INTO `User` (username, password, isAdmin, createdAt, updatedAt) VALUES (?, ?, 0, NOW(), NOW())',
        [username, passwordHash]
      );
    } catch (insertErr) {
      const isAdminMissing = insertErr.code === 'ER_BAD_FIELD_ERROR' || (insertErr.message && String(insertErr.message).includes('isAdmin'));
      if (isAdminMissing) {
        await conn.rollback();
        await conn.query('ALTER TABLE `User` ADD COLUMN `isAdmin` TINYINT(1) NOT NULL DEFAULT 0').catch(() => {});
        [result] = await conn.query(
          'INSERT INTO `User` (username, password, isAdmin, createdAt, updatedAt) VALUES (?, ?, 0, NOW(), NOW())',
          [username, passwordHash]
        );
        const token = generateToken();
        res.status(201).json({
          success: true,
          message: '注册成功',
          token,
          username,
          userId: result.insertId
        });
        conn.release();
        return;
      } else {
        await conn.rollback();
        throw insertErr;
      }
    }

    await conn.commit();

    // 生成 token（简化版，实际应使用 JWT）
    const token = generateToken();

    res.status(201).json({
      success: true,
      message: '注册成功',
      token,
      username,
      userId: result.insertId
    });
  } catch (error) {
    await conn.rollback();
    console.error('Registration error:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      errno: error.errno,
      sqlState: error.sqlState,
      sql: error.sql
    });
    console.error('Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    // 返回更详细的错误信息
    const errorMessage = error.message || '未知错误';
    const errorCode = error.code || 'UNKNOWN';
    res.status(500).json({ 
      error: '注册失败', 
      message: errorMessage,
      code: errorCode,
      details: process.env.NODE_ENV === 'development' ? error.sql : undefined
    });
  } finally {
    conn.release();
  }
});

// 登录接口
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }

  if (!pool) {
    return res.status(503).json({ error: '数据库未配置' });
  }

  const conn = await pool.getConnection();
  try {
    let users;
    try {
      [users] = await conn.query(
        'SELECT id, username, password, COALESCE(isAdmin, 0) AS isAdmin FROM `User` WHERE username = ? LIMIT 1',
        [username]
      );
    } catch (qErr) {
      if (qErr.code === 'ER_BAD_FIELD_ERROR' || (qErr.message && qErr.message.includes('isAdmin'))) {
        await conn.query('ALTER TABLE `User` ADD COLUMN `isAdmin` TINYINT(1) NOT NULL DEFAULT 0').catch(() => {});
        [users] = await conn.query(
          'SELECT id, username, password, COALESCE(isAdmin, 0) AS isAdmin FROM `User` WHERE username = ? LIMIT 1',
          [username]
        );
      } else throw qErr;
    }

    if (users.length === 0) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const user = users[0];

    // 验证密码
    if (!verifyPassword(password, user.password)) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    // 生成 token
    const token = generateToken();

    res.json({
      success: true,
      message: '登录成功',
      token,
      username: user.username,
      userId: user.id,
      isAdmin: Boolean(user.isAdmin)
    });
  } catch (error) {
    console.error('Login error:', error);
    const errorMessage = error.message || '未知错误';
    const errorCode = error.code || 'UNKNOWN';
    res.status(500).json({ 
      error: '登录失败', 
      message: errorMessage,
      code: errorCode
    });
  } finally {
    conn.release();
  }
});

// 管理员重置用户密码（忘记密码时用，Vercel 上无需跑脚本，直接调此接口）
app.post('/api/auth/admin/reset-password', async (req, res) => {
  const { username, newPassword, adminUsername, adminPassword } = req.body;

  if (!username || !newPassword || !adminUsername || !adminPassword) {
    return res.status(400).json({ error: '请提供 username、newPassword、adminUsername、adminPassword' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: '新密码长度至少为 6 个字符' });
  }

  if (!pool) {
    return res.status(503).json({ error: '数据库未配置' });
  }

  const conn = await pool.getConnection();
  try {
    // 验证管理员身份
    const [adminRows] = await conn.query(
      'SELECT id, username, password, COALESCE(isAdmin, 0) AS isAdmin FROM `User` WHERE username = ? LIMIT 1',
      [adminUsername]
    );
    if (adminRows.length === 0 || !verifyPassword(adminPassword, adminRows[0].password) || !adminRows[0].isAdmin) {
      return res.status(403).json({ error: '管理员账号或密码错误，或该账号不是管理员' });
    }

    // 查找要重置的用户
    const [targetRows] = await conn.query('SELECT id FROM `User` WHERE username = ? LIMIT 1', [username]);
    if (targetRows.length === 0) {
      return res.status(404).json({ error: '要重置的用户不存在' });
    }

    const hash = hashPassword(newPassword);
    await conn.query('UPDATE `User` SET password = ?, updatedAt = NOW() WHERE username = ?', [hash, username]);

    res.json({ success: true, message: '密码已重置' });
  } catch (error) {
    console.error('Admin reset-password error:', error);
    res.status(500).json({ error: '重置失败', message: error.message });
  } finally {
    conn.release();
  }
});

// 验证 token（简化版中间件）
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: '未授权，请先登录' });
  }

  // 简化版：实际应验证 token 并查询用户
  // 这里我们暂时信任 token，实际生产环境应使用 JWT 或 session
  req.user = { token }; // 简化处理
  next();
}

// 获取存档（需要认证）
app.get('/api/saves/:username/:slot', async (req, res) => {
  const { username, slot } = req.params;
  const slotNum = parseInt(slot);

  if (!pool) {
    return res.status(503).json({ error: '数据库未配置' });
  }

  const conn = await pool.getConnection();
  try {
    // 查找用户
    const [users] = await conn.query(
      'SELECT id FROM `User` WHERE username = ? LIMIT 1',
      [username]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const userId = users[0].id;

    // 查找存档
    const [saves] = await conn.query(
      'SELECT data, updatedAt FROM `GameSave` WHERE userId = ? AND slot = ? LIMIT 1',
      [userId, slotNum]
    );

    if (saves.length === 0) {
      return res.status(404).json({ error: '存档不存在' });
    }

    res.json({
      success: true,
      data: saves[0].data,
      updatedAt: saves[0].updatedAt
    });
  } catch (error) {
    console.error('Load save error:', error);
    res.status(500).json({ error: '读取存档失败', message: error.message });
  } finally {
    conn.release();
  }
});

// 保存存档（需要认证）
app.post('/api/saves/:username/:slot', async (req, res) => {
  const { username, slot } = req.params;
  const slotNum = parseInt(slot);
  const saveData = req.body;

  if (!pool) {
    return res.status(503).json({ error: '数据库未配置' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 查找或创建用户
    const [userRows] = await conn.query(
      'SELECT id FROM `User` WHERE username = ? LIMIT 1',
      [username]
    );

    let userId;
    if (userRows.length === 0) {
      // 用户不存在，但这里不应该自动创建（应该先注册）
      await conn.rollback();
      return res.status(404).json({ error: '用户不存在，请先注册' });
    } else {
      userId = userRows[0].id;
    }

    // 检查存档是否存在
    const [existingSaves] = await conn.query(
      'SELECT id FROM `GameSave` WHERE userId = ? AND slot = ? LIMIT 1',
      [userId, slotNum]
    );

    if (existingSaves.length > 0) {
      // 更新现有存档（updatedAt 会自动更新）
      await conn.query(
        'UPDATE `GameSave` SET data = ? WHERE userId = ? AND slot = ?',
        [JSON.stringify(saveData), userId, slotNum]
      );
    } else {
      // 创建新存档（createdAt 和 updatedAt 会自动设置）
      await conn.query(
        'INSERT INTO `GameSave` (userId, slot, data) VALUES (?, ?, ?)',
        [userId, slotNum, JSON.stringify(saveData)]
      );
    }

    await conn.commit();
    res.json({ success: true, message: '存档保存成功' });
  } catch (error) {
    await conn.rollback();
    console.error('Save error:', error);
    res.status(500).json({ error: '保存存档失败', message: error.message });
  } finally {
    conn.release();
  }
});

// 保存精灵到当前用户的精灵仓库
app.post('/api/monsters/:username', async (req, res) => {
  const username = req.params.username;
  const monsterData = req.body;

  if (!username) {
    return res.status(400).json({ error: '缺少用户名' });
  }
  if (!monsterData || !monsterData.name || !monsterData.element) {
    return res.status(400).json({ error: '精灵数据不完整' });
  }

  if (!pool) {
    return res.status(503).json({ error: '数据库未配置' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 根据用户名获取 userId
    const [users] = await conn.query('SELECT id FROM `User` WHERE username = ? LIMIT 1', [username]);
    if (users.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: '用户不存在' });
    }
    const userId = users[0].id;

    // 在该用户的仓库内检查是否已存在相同 ID 的精灵（前端 UUID）
    const [existingMonsters] = await conn.query(
      'SELECT id FROM `Monster` WHERE userId = ? AND JSON_EXTRACT(data, "$.id") = ? LIMIT 1',
      [userId, monsterData.id]
    );

    if (existingMonsters.length > 0) {
      // 更新该用户仓库内的现有精灵
      await conn.query(
        'UPDATE `Monster` SET name = ?, element = ?, description = ?, imageUrl = ?, modelUrl = ?, visualPrompt = ?, data = ? WHERE userId = ? AND JSON_EXTRACT(data, "$.id") = ?',
        [
          monsterData.name,
          monsterData.element,
          monsterData.description || null,
          monsterData.imageUrl || null,
          monsterData.modelUrl || null,
          monsterData.visualPrompt || null,
          JSON.stringify(monsterData),
          userId,
          monsterData.id
        ]
      );
      await conn.commit();
      return res.json({ success: true, message: '精灵已更新', monsterId: existingMonsters[0].id });
    } else {
      // 在该用户仓库内创建新精灵
      const [result] = await conn.query(
        'INSERT INTO `Monster` (userId, name, element, description, imageUrl, modelUrl, visualPrompt, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          userId,
          monsterData.name,
          monsterData.element,
          monsterData.description || null,
          monsterData.imageUrl || null,
          monsterData.modelUrl || null,
          monsterData.visualPrompt || null,
          JSON.stringify(monsterData)
        ]
      );
      await conn.commit();
      return res.status(201).json({ success: true, message: '精灵已保存', monsterId: result.insertId });
    }
  } catch (error) {
    await conn.rollback();
    console.error('Save monster error:', error);
    res.status(500).json({ error: '保存精灵失败', message: error.message });
  } finally {
    conn.release();
  }
});

// 获取当前用户的精灵仓库列表
app.get('/api/monsters/:username', async (req, res) => {
  const username = req.params.username;

  if (!username) {
    return res.status(400).json({ error: '缺少用户名' });
  }
  if (!pool) {
    return res.status(503).json({ error: '数据库未配置' });
  }

  const conn = await pool.getConnection();
  try {
    const [users] = await conn.query('SELECT id FROM `User` WHERE username = ? LIMIT 1', [username]);
    if (users.length === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }
    const userId = users[0].id;

    const [rows] = await conn.query(
      'SELECT id, name, element, description, imageUrl, data, createdAt FROM `Monster` WHERE userId = ? ORDER BY createdAt DESC',
      [userId]
    );
    res.json({ success: true, monsters: rows });
  } catch (error) {
    console.error('List monsters error:', error);
    res.status(500).json({ error: '获取精灵仓库失败', message: error.message });
  } finally {
    conn.release();
  }
});

// 仅在本机直接运行或非 Vercel 时启动 HTTP 服务；在 Vercel 上由 Serverless 调用
if (typeof process.env.VERCEL === 'undefined' && require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Backend server running on http://localhost:${PORT}`);
    if (!pool) {
      console.warn('⚠️  Database not configured. Set DATABASE_URL in .env');
    } else {
      console.log('✅ Database connection pool created');
      pool.query('SELECT 1').then(() => {
        console.log('✅ Database connection test successful');
      }).catch((err) => {
        console.error('❌ Database connection test failed:', err.message);
      });
      ensureAdminUser().catch(() => {});
    }
  });
  process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
  });
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });
}

module.exports = app;
