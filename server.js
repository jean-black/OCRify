const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const WebSocket = require('ws');
const cron = require('node-cron');
const path = require('path');
require('dotenv').config();

const gmailService = require('./utils/gmailService');
const megaUploader = require('./utils/megaUploader');
const pdfGenerator = require('./utils/simplePdfGenerator');

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP'
});

app.use(limiter);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://maps.googleapis.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "wss:", "https:"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"]
    }
  }
}));
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'safezone-secret-key', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

const generateToken = () => {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
};

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await pool.query('SELECT * FROM dbt1 WHERE farmer_id = $1', [email]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const isValidPassword = await bcrypt.compare(password, user.password);
    
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { farmerId: user.farmer_id, token: user.token },
      process.env.JWT_SECRET || 'safezone-secret-key',
      { expiresIn: '24h' }
    );

    await pool.query('INSERT INTO dbt2 (farmer_token, gps_coordinate, timestamp) VALUES ($1, $2, NOW())', 
      [user.token, req.body.gps || '0,0']);

    res.json({ token, farmer_id: user.farmer_id });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (password.length < 10) {
      return res.status(400).json({ error: 'Password must be at least 10 characters' });
    }

    let farmerId = email;
    const existingUser = await pool.query('SELECT farmer_id FROM dbt1 WHERE farmer_id = $1', [farmerId]);
    
    if (existingUser.rows.length > 0) {
      const randomNumber = Math.floor(Math.random() * 900) + 100;
      farmerId = `${email}${randomNumber}`;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const token = generateToken();

    await pool.query(
      'INSERT INTO dbt1 (farmer_id, token, password, timestamp) VALUES ($1, $2, $3, NOW())',
      [farmerId, token, hashedPassword]
    );

    const jwtToken = jwt.sign(
      { farmerId, token },
      process.env.JWT_SECRET || 'safezone-secret-key',
      { expiresIn: '24h' }
    );

    res.json({ token: jwtToken, farmer_id: farmerId });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
  try {
    const farmerToken = req.user.token;
    
    const alarmStats = await pool.query(`
      SELECT DATE(timestamp) as date, COUNT(*) as total_alarms
      FROM dbt9 d9
      JOIN dbt5 d5 ON d9.cow_token = d5.token
      WHERE d5.farmer_token = $1 AND timestamp >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(timestamp)
      ORDER BY date DESC
    `, [farmerToken]);

    const topCows = await pool.query(`
      SELECT d5.cow_id, COUNT(*) as breach_count
      FROM dbt9 d9
      JOIN dbt5 d5 ON d9.cow_token = d5.token
      WHERE d5.farmer_token = $1
      GROUP BY d5.cow_id
      ORDER BY breach_count DESC
      LIMIT 5
    `, [farmerToken]);

    res.json({
      alarmStats: alarmStats.rows,
      topCows: topCows.rows
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/notifications', authenticateToken, async (req, res) => {
  try {
    res.json({ notifications: [] });
  } catch (error) {
    console.error('Notifications error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/farms', authenticateToken, async (req, res) => {
  try {
    const farmerToken = req.user.token;
    
    const farms = await pool.query(
      'SELECT farm_id, farm_gps FROM dbt2_farms WHERE farmer_token = $1',
      [farmerToken]
    );

    res.json({ farms: farms.rows });
  } catch (error) {
    console.error('Farms error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/farms', authenticateToken, async (req, res) => {
  try {
    const { farmName, gps } = req.body;
    const farmerToken = req.user.token;
    const farmToken = generateToken();
    
    await pool.query(
      'INSERT INTO dbt2_farms (farm_id, token, farmer_token, farm_gps, timestamp) VALUES ($1, $2, $3, $4, NOW())',
      [farmName, farmToken, farmerToken, gps]
    );

    res.json({ success: true, farm_id: farmName });
  } catch (error) {
    console.error('Create farm error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/fences', authenticateToken, async (req, res) => {
  try {
    const farmerToken = req.user.token;
    
    const fences = await pool.query(`
      SELECT d4.fence_id, d4.fence_nodes, d4.area_size, d2f.farm_id
      FROM dbt4 d4
      JOIN dbt2_farms d2f ON d4.farmer_token = d2f.farmer_token
      WHERE d4.farmer_token = $1
    `, [farmerToken]);

    res.json({ fences: fences.rows });
  } catch (error) {
    console.error('Fences error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/fences', authenticateToken, async (req, res) => {
  try {
    const { fenceName, nodes, farmId } = req.body;
    const farmerToken = req.user.token;
    const fenceToken = generateToken();
    
    const area = calculatePolygonArea(nodes);
    
    await pool.query(
      'INSERT INTO dbt4 (fence_id, token, farmer_token, fence_nodes, area_size, timestamp) VALUES ($1, $2, $3, $4, $5, NOW())',
      [fenceName, fenceToken, farmerToken, JSON.stringify(nodes), area]
    );

    res.json({ success: true, fence_id: fenceName });
  } catch (error) {
    console.error('Create fence error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/cows', authenticateToken, async (req, res) => {
  try {
    const farmerToken = req.user.token;
    
    const cows = await pool.query(`
      SELECT d5.cow_id, d6.real_time_coordinate, d7.tag, d8.speed
      FROM dbt5 d5
      LEFT JOIN dbt6 d6 ON d5.token = d6.cow_token
      LEFT JOIN dbt7 d7 ON d5.token = d7.cow_token
      LEFT JOIN dbt8 d8 ON d5.token = d8.cow_token
      WHERE d5.farmer_token = $1
    `, [farmerToken]);

    res.json({ cows: cows.rows });
  } catch (error) {
    console.error('Cows error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/collaborative/link', authenticateToken, async (req, res) => {
  try {
    const { cowId } = req.body;
    const linkId = generateToken();
    
    await pool.query(
      'INSERT INTO dbt16 (assistive_cooperation_id, timestamp) VALUES ($1, NOW())',
      [linkId]
    );

    const ephemeralLink = `${req.protocol}://${req.get('host')}/collaborative/${linkId}`;
    
    res.json({ link: ephemeralLink });
  } catch (error) {
    console.error('Collaborative link error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/collaborative/:linkId', async (req, res) => {
  const { linkId } = req.params;
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/esp32/data', async (req, res) => {
  try {
    const { cowId, gps, speed, tag, alarmState } = req.body;
    
    if (gps) {
      await pool.query(
        'INSERT INTO dbt6 (cow_token, real_time_coordinate, timestamp) VALUES ($1, $2, NOW())',
        [cowId, gps]
      );
    }

    if (speed !== undefined) {
      await pool.query(
        'INSERT INTO dbt8 (cow_token, speed, timestamp) VALUES ($1, $2, NOW())',
        [cowId, speed]
      );
    }

    if (tag) {
      await pool.query(
        'INSERT INTO dbt7 (cow_token, tag, timestamp) VALUES ($1, $2, NOW())',
        [cowId, tag]
      );
    }

    if (alarmState) {
      await pool.query(
        'INSERT INTO dbt9 (cow_token, alarm_breach_state, timestamp) VALUES ($1, $2, NOW())',
        [cowId, alarmState]
      );
      
      await gmailService.sendAlert(
        process.env.GMAIL_RECEIVER || 'jeanclaudemng@gmail.com',
        'SafeZone Alert',
        `Cow ${cowId} has triggered alarm: ${alarmState}`
      );
    }

    res.json({ success: true });
  } catch (error) {
    console.error('ESP32 data error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function calculatePolygonArea(nodes) {
  if (nodes.length < 3) return 0;
  
  let area = 0;
  for (let i = 0; i < nodes.length; i++) {
    const j = (i + 1) % nodes.length;
    area += nodes[i].lat * nodes[j].lng;
    area -= nodes[j].lat * nodes[i].lng;
  }
  return Math.abs(area) / 2;
}

cron.schedule('59 23 * * *', async () => {
  try {
    console.log('Generating 24MPF report...');
    
    const reportData = await pool.query(`
      SELECT 
        COUNT(CASE WHEN d9.alarm_breach_state = 'alarm1' THEN 1 END) as alarm1_count,
        COUNT(CASE WHEN d9.alarm_breach_state = 'alarm2' THEN 1 END) as alarm2_count,
        COUNT(CASE WHEN d9.alarm_breach_state = 'alarm3' THEN 1 END) as alarm3_count,
        COUNT(DISTINCT d5.cow_id) as total_cows
      FROM dbt9 d9
      JOIN dbt5 d5 ON d9.cow_token = d5.token
      WHERE DATE(d9.timestamp) = CURRENT_DATE
    `);

    const pdfBuffer = await pdfGenerator.generate24MPF(reportData.rows[0]);
    const megaLink = await megaUploader.uploadFile(pdfBuffer, `24MPF-${new Date().toISOString().split('T')[0]}.pdf`);
    
    await gmailService.sendAlert(
      process.env.GMAIL_RECEIVER || 'jeanclaudemng@gmail.com',
      'SafeZone Daily Report',
      `Daily report is ready: ${megaLink}`
    );

    console.log('24MPF report generated and sent');
  } catch (error) {
    console.error('24MPF generation error:', error);
  }
});

cron.schedule('0 0 * * *', async () => {
  try {
    const tables = ['dbt6', 'dbt7', 'dbt8', 'dbt9'];
    
    for (const table of tables) {
      const count = await pool.query(`SELECT COUNT(*) FROM ${table}`);
      if (parseInt(count.rows[0].count) >= 1000) {
        const data = await pool.query(`SELECT * FROM ${table}`);
        const pdfBuffer = await pdfGenerator.generateTablePDF(table, data.rows);
        await megaUploader.uploadFile(pdfBuffer, `${table}-${Date.now()}.pdf`);
        await pool.query(`DELETE FROM ${table}`);
        console.log(`Table ${table} archived and cleared`);
      }
    }
  } catch (error) {
    console.error('Database cleanup error:', error);
  }
});

const server = app.listen(PORT, () => {
  console.log(`SafeZone server running on port ${PORT}`);
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      wss.clients.forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(data));
        }
      });
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });

  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });
});

async function initializeDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS dbt1 (
        id SERIAL PRIMARY KEY,
        farmer_id VARCHAR(255) UNIQUE,
        token VARCHAR(255),
        password VARCHAR(255),
        timestamp TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS dbt2 (
        id SERIAL PRIMARY KEY,
        farmer_token VARCHAR(255),
        gps_coordinate TEXT,
        timestamp TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS dbt2_farms (
        id SERIAL PRIMARY KEY,
        farm_id VARCHAR(255),
        token VARCHAR(255),
        farmer_token VARCHAR(255),
        farm_gps TEXT,
        timestamp TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS dbt4 (
        id SERIAL PRIMARY KEY,
        fence_id VARCHAR(255),
        token VARCHAR(255),
        farmer_token VARCHAR(255),
        fence_nodes TEXT,
        area_size DECIMAL,
        timestamp TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS dbt5 (
        id SERIAL PRIMARY KEY,
        cow_id VARCHAR(255),
        token VARCHAR(255),
        farmer_token VARCHAR(255),
        timestamp TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS dbt6 (
        id SERIAL PRIMARY KEY,
        cow_token VARCHAR(255),
        real_time_coordinate TEXT,
        timestamp TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS dbt7 (
        id SERIAL PRIMARY KEY,
        cow_token VARCHAR(255),
        tag VARCHAR(255),
        timestamp TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS dbt8 (
        id SERIAL PRIMARY KEY,
        cow_token VARCHAR(255),
        speed DECIMAL,
        timestamp TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS dbt9 (
        id SERIAL PRIMARY KEY,
        cow_token VARCHAR(255),
        alarm_breach_state VARCHAR(255),
        timestamp TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS dbt16 (
        id SERIAL PRIMARY KEY,
        assistive_cooperation_id VARCHAR(255),
        timestamp TIMESTAMP DEFAULT NOW()
      );
    `);
    
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
  }
}

initializeDatabase();