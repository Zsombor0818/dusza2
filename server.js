const express = require('express');
const mysql = require('mysql2/promise');
const crypto = require('crypto');
const path = require('path');
const MapFormat = require('./public/map.js');

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'dusza_robot'
};
const PORT = Number(process.env.PORT || 3000);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let db;
const sessions = new Map();

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return salt + ':' + crypto.scryptSync(password, salt, 32).toString('hex');
}

function checkPassword(password, stored) {
  const [salt] = stored.split(':');
  return hashPassword(password, salt) === stored;
}

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const user = sessions.get(token);
  if (!user) return res.status(401).json({ error: 'Jelentkezz be!' });
  req.user = user;
  next();
}

function validMap(req, res) {
  const name = String(req.body.name || '').trim();
  if (!name || name.length > 50) {
    res.status(400).json({ error: 'A térkép neve 1-50 karakter lehet.' });
    return null;
  }
  try {
    const parsed = MapFormat.parse(req.body.data || '');
    return { name, data: MapFormat.stringify(parsed.grid) };
  } catch (e) {
    res.status(400).json({ error: e.message });
    return null;
  }
}

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const [rows] = await db.query('SELECT * FROM users WHERE username = ?', [username || '']);
  if (!rows.length || !checkPassword(password || '', rows[0].password)) {
    return res.status(401).json({ error: 'Hibás felhasználónév vagy jelszó.' });
  }
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { id: rows[0].id, username: rows[0].username });
  res.json({ token, username: rows[0].username });
});

app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!/^[A-Za-z0-9_]{3,20}$/.test(username || '')) {
    return res.status(400).json({ error: 'A felhasználónév 3-20 karakter (betű, szám, _) lehet.' });
  }
  if (!password || password.length < 4) {
    return res.status(400).json({ error: 'A jelszó legalább 4 karakter legyen.' });
  }
  const [rows] = await db.query('SELECT id FROM users WHERE username = ?', [username]);
  if (rows.length) return res.status(400).json({ error: 'Ez a felhasználónév már foglalt.' });
  await db.query('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashPassword(password)]);
  res.json({ ok: true });
}); 


app.post('/api/logout', auth, (req, res) => {
  sessions.delete(req.headers.authorization.replace('Bearer ', ''));
  res.json({ ok: true });
});

app.get('/api/me', auth, (req, res) => res.json(req.user));

app.get('/api/maps', auth, async (req, res) => {
  const [rows] = await db.query(
    'SELECT m.id, m.name, m.data, m.user_id, u.username AS owner FROM maps m JOIN users u ON u.id = m.user_id ORDER BY m.id'
  );
  res.json(rows);
});

app.post('/api/maps', auth, async (req, res) => {
  const map = validMap(req, res);
  if (!map) return;
  const [result] = await db.query('INSERT INTO maps (name, data, user_id) VALUES (?, ?, ?)', [map.name, map.data, req.user.id]);
  res.json({ id: result.insertId });
});

app.put('/api/maps/:id', auth, async (req, res) => {
  const map = validMap(req, res);
  if (!map) return;
  const [result] = await db.query('UPDATE maps SET name = ?, data = ? WHERE id = ? AND user_id = ?', [map.name, map.data, req.params.id, req.user.id]);
  if (!result.affectedRows) return res.status(403).json({ error: 'Csak a saját térképedet módosíthatod.' });
  await db.query('DELETE FROM results WHERE map_id = ?', [req.params.id]);
  res.json({ ok: true });
});

app.delete('/api/maps/:id', auth, async (req, res) => {
  const [result] = await db.query('DELETE FROM maps WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!result.affectedRows) return res.status(403).json({ error: 'Csak a saját térképedet törölheted.' });
  res.json({ ok: true });
});

app.post('/api/results', auth, async (req, res) => {
  const { mapId, gold, steps } = req.body;
  if (!Number.isInteger(gold) || !Number.isInteger(steps) || gold < 0 || steps < 0 || steps > 1000) {
    return res.status(400).json({ error: 'Érvénytelen eredmény.' });
  }
  await db.query('INSERT INTO results (user_id, map_id, gold, steps) VALUES (?, ?, ?, ?)', [req.user.id, mapId, gold, steps]);
  res.json({ ok: true });
});

app.get('/api/leaderboard/:mapId', auth, async (req, res) => {
  const [rows] = await db.query(
    `SELECT u.username, r.gold, r.steps, r.created_at FROM results r JOIN users u ON u.id = r.user_id
     WHERE r.map_id = ? ORDER BY r.gold DESC, r.steps ASC, r.created_at ASC`,
    [req.params.mapId]
  );
  const seen = new Set();
  res.json(rows.filter(r => !seen.has(r.username) && seen.add(r.username)));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Szerverhiba történt.' });
});

async function setup() {
  const { database, ...server } = config;
  const conn = await mysql.createConnection(server);
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_hungarian_ci`);
  await conn.end();

  db = mysql.createPool(config);
  await db.query(`CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(20) NOT NULL UNIQUE,
    password VARCHAR(100) NOT NULL
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS maps (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    data TEXT NOT NULL,
    user_id INT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS results (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    map_id INT NOT NULL,
    gold INT NOT NULL,
    steps INT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE
  )`);

  const [users] = await db.query('SELECT COUNT(*) AS n FROM users');
  if (users[0].n === 0) {
    const [demo] = await db.query('INSERT INTO users (username, password) VALUES (?, ?)', ['demo', hashPassword('demo')]);
    const [bela] = await db.query('INSERT INTO users (username, password) VALUES (?, ?)', ['bela', hashPassword('bela')]);
    const maps = [
      ['Bevezető bánya', '3 15\n....@..........\n.#############.\n.......@...>...'],
      ['Folyosó', '1 10\n>.@..@.@.@'],
      ['Labirintus', '7 7\n>..#@..\n.#.#.#.\n.#...#.\n.####@.\n.@...#.\n####.#.\n@.....@']
    ];
    for (const [name, data] of maps) {
      await db.query('INSERT INTO maps (name, data, user_id) VALUES (?, ?, ?)', [name, data, demo.insertId]);
    }
    await db.query('INSERT INTO results (user_id, map_id, gold, steps) VALUES (?, 2, 4, 40), (?, 2, 2, 25)', [demo.insertId, bela.insertId]);
  }
}

setup()
  .then(() => app.listen(PORT, () => console.log(`A szerver fut: http://localhost:${PORT}`)))
  .catch(err => {
    console.error('Nem sikerült csatlakozni az adatbázishoz:', err.message || err.code);
    process.exit(1);
  });
