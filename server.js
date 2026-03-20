const express = require('express');
const multer = require('multer');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure directories exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

// Database setup
const db = new Database(path.join(__dirname, 'bmse.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    author TEXT NOT NULL,
    category TEXT DEFAULT 'General',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    mime_type TEXT,
    size INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    author TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
  );
`);

// File upload config
const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));

// ── Posts ─────────────────────────────────────────────
app.get('/api/posts', (req, res) => {
  const { category, search } = req.query;
  let sql = `SELECT p.*,
    (SELECT COUNT(*) FROM comments WHERE post_id = p.id) AS comment_count,
    (SELECT COUNT(*) FROM files WHERE post_id = p.id) AS file_count
    FROM posts p`;
  const params = [];
  const conditions = [];

  if (category && category !== 'All') {
    conditions.push('p.category = ?');
    params.push(category);
  }
  if (search) {
    conditions.push('(p.title LIKE ? OR p.content LIKE ? OR p.author LIKE ?)');
    const s = `%${search}%`;
    params.push(s, s, s);
  }
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY p.created_at DESC';

  res.json(db.prepare(sql).all(...params));
});

app.get('/api/posts/:id', (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Not found' });
  const files = db.prepare('SELECT * FROM files WHERE post_id = ?').all(post.id);
  const comments = db.prepare('SELECT * FROM comments WHERE post_id = ? ORDER BY created_at ASC').all(post.id);
  res.json({ ...post, files, comments });
});

app.post('/api/posts', upload.array('files', 10), (req, res) => {
  const { title, content, author, category } = req.body;
  if (!title || !content || !author) {
    return res.status(400).json({ error: 'title, content and author are required' });
  }

  const result = db.prepare(
    'INSERT INTO posts (title, content, author, category) VALUES (?, ?, ?, ?)'
  ).run(title, content, author, category || 'General');

  const postId = result.lastInsertRowid;

  if (req.files && req.files.length) {
    const insertFile = db.prepare(
      'INSERT INTO files (post_id, original_name, stored_name, mime_type, size) VALUES (?, ?, ?, ?, ?)'
    );
    for (const f of req.files) {
      insertFile.run(postId, f.originalname, f.filename, f.mimetype, f.size);
    }
  }

  res.status(201).json({ id: postId });
});

app.delete('/api/posts/:id', (req, res) => {
  const files = db.prepare('SELECT stored_name FROM files WHERE post_id = ?').all(req.params.id);
  files.forEach(f => {
    const fp = path.join(uploadsDir, f.stored_name);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  });
  db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── Comments ──────────────────────────────────────────
app.post('/api/posts/:id/comments', (req, res) => {
  const { author, content } = req.body;
  if (!author || !content) return res.status(400).json({ error: 'author and content required' });

  const result = db.prepare(
    'INSERT INTO comments (post_id, author, content) VALUES (?, ?, ?)'
  ).run(req.params.id, author, content);

  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(comment);
});

app.delete('/api/comments/:id', (req, res) => {
  db.prepare('DELETE FROM comments WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── File download ─────────────────────────────────────
app.get('/api/files/:id/download', (req, res) => {
  const file = db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id);
  if (!file) return res.status(404).json({ error: 'Not found' });
  res.download(path.join(uploadsDir, file.stored_name), file.original_name);
});

app.listen(PORT, () => console.log(`BMSE Faculty Homepage running on http://localhost:${PORT}`));
