import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { path: '/finance/socket.io' });

const DB_PATH = path.join(__dirname, '../data/expenses.db');
console.log('Database path:', DB_PATH);

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Database connected successfully');
  }
});

// Initialize database
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    category TEXT,
    user TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE INDEX IF NOT EXISTS idx_date ON expenses(date)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_user ON expenses(user)`);
});

app.use(express.json());
app.use(express.static(path.join(__dirname, '../dist')));

// Get expenses with date range filter
app.get('/api/expenses', (req, res) => {
  const { start, end } = req.query;
  let query = 'SELECT * FROM expenses';
  const params: any[] = [];
  
  if (start && end) {
    query += ' WHERE date BETWEEN ? AND ?';
    params.push(start, end);
  }
  
  query += ' ORDER BY date DESC, id DESC';
  
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Add expense
app.post('/api/expenses', (req, res) => {
  const { date, description, amount, category, user } = req.body;
  console.log('Adding expense:', { date, description, amount, category, user });
  
  if (!date || !description || amount === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  db.run(
    'INSERT INTO expenses (date, description, amount, category, user) VALUES (?, ?, ?, ?, ?)',
    [date, description, amount, category || '', user || 'user1'],
    function(err) {
      if (err) {
        console.error('Error inserting expense:', err);
        return res.status(500).json({ error: err.message });
      }
      
      console.log('Expense inserted with ID:', this.lastID);
      db.get('SELECT * FROM expenses WHERE id = ?', [this.lastID], (err, row) => {
        if (err) {
          console.error('Error retrieving expense:', err);
          return res.status(500).json({ error: err.message });
        }
        console.log('Expense retrieved:', row);
        io.emit('expense-added', row);
        res.json(row);
      });
    }
  );
});

// Update expense
app.put('/api/expenses/:id', (req, res) => {
  const { id } = req.params;
  const { date, description, amount, category } = req.body;
  
  db.run(
    'UPDATE expenses SET date = ?, description = ?, amount = ?, category = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [date, description, amount, category, id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      
      db.get('SELECT * FROM expenses WHERE id = ?', [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        io.emit('expense-updated', row);
        res.json(row);
      });
    }
  );
});

// Delete expense
app.delete('/api/expenses/:id', (req, res) => {
  const { id } = req.params;
  
  db.run('DELETE FROM expenses WHERE id = ?', [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    io.emit('expense-deleted', { id });
    res.json({ success: true });
  });
});

// Summary endpoint
app.get('/api/summary', (req, res) => {
  const { start, end } = req.query;
  let query = 'SELECT category, SUM(amount) as total FROM expenses';
  const params: any[] = [];
  
  if (start && end) {
    query += ' WHERE date BETWEEN ? AND ?';
    params.push(start, end);
  }
  
  query += ' GROUP BY category';
  
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

io.on('connection', (socket) => {
  console.log('Client connected');
  socket.on('disconnect', () => console.log('Client disconnected'));
});

const PORT = 8080;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Finance Manager running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
  console.log(`Database: ${DB_PATH}`);
});
