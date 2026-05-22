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

// Validation helper functions
const isValidDate = (dateString: string): boolean => {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) return false;
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime());
};

const validateExpenseInput = (data: any): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  if (!data.date || typeof data.date !== 'string' || !isValidDate(data.date)) {
    errors.push('Date must be in YYYY-MM-DD format');
  }
  
  if (!data.description || typeof data.description !== 'string' || data.description.trim().length === 0) {
    errors.push('Description must be a non-empty string');
  }
  
  if (data.amount === undefined || data.amount === null || typeof data.amount !== 'number' || data.amount <= 0) {
    errors.push('Amount must be a positive number');
  }
  
  if (data.category !== undefined && data.category !== null && typeof data.category !== 'string') {
    errors.push('Category must be a string');
  }
  
  if (data.user && typeof data.user !== 'string') {
    errors.push('User must be a string');
  }
  
  return { valid: errors.length === 0, errors };
};

// Get expenses with date range filter and pagination
app.get('/api/expenses', (req, res) => {
  try {
    const { start, end, page, limit } = req.query;
    
    // Parse pagination params
    const pageNum = page ? parseInt(page as string, 10) : 1;
    const limitNum = limit ? parseInt(limit as string, 10) : 50;
    const offset = (pageNum - 1) * limitNum;
    
    // Validate pagination params
    if (isNaN(pageNum) || pageNum < 1) {
      return res.status(400).json({ error: 'Invalid page number' });
    }
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 1000) {
      return res.status(400).json({ error: 'Invalid limit (must be 1-1000)' });
    }
    
    let whereClause = '';
    const params: any[] = [];
    
    if (start && end) {
      whereClause = ' WHERE date BETWEEN ? AND ?';
      params.push(start, end);
    }
    
    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM expenses${whereClause}`;
    db.get(countQuery, params, (err, countResult: any) => {
      if (err) {
        console.error('Error counting expenses:', err);
        return res.status(500).json({ error: 'Failed to count expenses' });
      }
      
      const totalCount = countResult.total;
      const totalPages = Math.ceil(totalCount / limitNum);
      
      // Get paginated data
      const dataQuery = `SELECT * FROM expenses${whereClause} ORDER BY date DESC, id DESC LIMIT ? OFFSET ?`;
      db.all(dataQuery, [...params, limitNum, offset], (err, rows) => {
        if (err) {
          console.error('Error fetching expenses:', err);
          return res.status(500).json({ error: 'Failed to fetch expenses' });
        }
        
        res.json({
          data: rows,
          totalCount,
          page: pageNum,
          totalPages,
          limit: limitNum
        });
      });
    });
  } catch (error: any) {
    console.error('Unexpected error in GET /api/expenses:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add expense
app.post('/api/expenses', (req, res) => {
  try {
    const { date, description, amount, category, user } = req.body;
    console.log('Adding expense:', { date, description, amount, category, user });
    
    // Validate input
    const validation = validateExpenseInput({ date, description, amount, category, user });
    if (!validation.valid) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: validation.errors 
      });
    }
    
    db.run(
      'INSERT INTO expenses (date, description, amount, category, user) VALUES (?, ?, ?, ?, ?)',
      [date.trim(), description.trim(), amount, (category || '').trim(), (user || 'user1').trim()],
      function(err) {
        if (err) {
          console.error('Error inserting expense:', err);
          return res.status(500).json({ error: 'Database insertion failed' });
        }
        
        console.log('Expense inserted with ID:', this.lastID);
        db.get('SELECT * FROM expenses WHERE id = ?', [this.lastID], (err, row) => {
          if (err) {
            console.error('Error retrieving expense:', err);
            return res.status(500).json({ error: 'Failed to retrieve created expense' });
          }
          console.log('Expense retrieved:', row);
          // Only emit socket event after successful DB operation
          io.emit('expense-added', row);
          res.json(row);
        });
      }
    );
  } catch (error: any) {
    console.error('Unexpected error in POST /api/expenses:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update expense
app.put('/api/expenses/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { date, description, amount, category } = req.body;
    
    // Validate ID
    const expenseId = parseInt(id, 10);
    if (isNaN(expenseId) || expenseId < 1) {
      return res.status(400).json({ error: 'Invalid expense ID' });
    }
    
    // Validate input
    const validation = validateExpenseInput({ date, description, amount, category });
    if (!validation.valid) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: validation.errors 
      });
    }
    
    db.run(
      'UPDATE expenses SET date = ?, description = ?, amount = ?, category = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [date.trim(), description.trim(), amount, (category || '').trim(), expenseId],
      function(err) {
        if (err) {
          console.error('Error updating expense:', err);
          return res.status(500).json({ error: 'Database update failed' });
        }
        
        if (this.changes === 0) {
          return res.status(404).json({ error: 'Expense not found' });
        }
        
        db.get('SELECT * FROM expenses WHERE id = ?', [expenseId], (err, row) => {
          if (err) {
            console.error('Error retrieving updated expense:', err);
            return res.status(500).json({ error: 'Failed to retrieve updated expense' });
          }
          // Only emit socket event after successful DB operation
          io.emit('expense-updated', row);
          res.json(row);
        });
      }
    );
  } catch (error: any) {
    console.error('Unexpected error in PUT /api/expenses/:id:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete expense
app.delete('/api/expenses/:id', (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate ID
    const expenseId = parseInt(id, 10);
    if (isNaN(expenseId) || expenseId < 1) {
      return res.status(400).json({ error: 'Invalid expense ID' });
    }
    
    // First, retrieve the expense before deletion (for undo functionality)
    db.get('SELECT * FROM expenses WHERE id = ?', [expenseId], (err, row) => {
      if (err) {
        console.error('Error retrieving expense for deletion:', err);
        return res.status(500).json({ error: 'Failed to retrieve expense' });
      }
      
      if (!row) {
        return res.status(404).json({ error: 'Expense not found' });
      }
      
      db.run('DELETE FROM expenses WHERE id = ?', [expenseId], function(err) {
        if (err) {
          console.error('Error deleting expense:', err);
          return res.status(500).json({ error: 'Database deletion failed' });
        }
        
        // Only emit socket event after successful deletion
        io.emit('expense-deleted', { id: expenseId });
        res.json({ success: true, deleted: row });
      });
    });
  } catch (error: any) {
    console.error('Unexpected error in DELETE /api/expenses/:id:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Summary endpoint
app.get('/api/summary', (req, res) => {
  try {
    const { start, end } = req.query;
    let query = 'SELECT category, SUM(amount) as total FROM expenses';
    const params: any[] = [];
    
    if (start && end) {
      query += ' WHERE date BETWEEN ? AND ?';
      params.push(start, end);
    }
    
    query += ' GROUP BY category';
    
    db.all(query, params, (err, rows) => {
      if (err) {
        console.error('Error fetching summary:', err);
        return res.status(500).json({ error: 'Failed to fetch summary' });
      }
      res.json(rows);
    });
  } catch (error: any) {
    console.error('Unexpected error in GET /api/summary:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
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
