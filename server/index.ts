import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { path: '/finance/socket.io' });

// Setup Data Directory
const DATA_DIR = path.join(__dirname, '../data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'expenses.db');
console.log('Database path:', DB_PATH);

// Setup Auth binary files
const AUTH_BIN_PATH = path.join(DATA_DIR, 'finance_auth.bin');
const ADMIN_AUTH_BIN_PATH = path.join(DATA_DIR, 'finance_admin_auth.bin');

// Use environment variable for encryption
const rawKey = process.env.ENCRYPTION_KEY || '12345678901234567890123456789012';
const ENCRYPTION_KEY = Buffer.alloc(32);
const keyBuffer = Buffer.from(rawKey, 'utf8');
keyBuffer.copy(ENCRYPTION_KEY);

const IV_LENGTH = 16;

function encryptPassword(text: string): Buffer {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, encrypted]);
}

function decryptPassword(buffer: Buffer): string {
  try {
    const iv = buffer.subarray(0, IV_LENGTH);
    const encryptedText = buffer.subarray(IV_LENGTH);
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (e) {
    return "";
  }
}

function getAdminPassword(): string {
  if (fs.existsSync(ADMIN_AUTH_BIN_PATH)) {
    const encryptedBuffer = fs.readFileSync(ADMIN_AUTH_BIN_PATH);
    return decryptPassword(encryptedBuffer);
  }
  return "Admin2026@";
}

// Create auth files if they don't exist
const DEFAULT_PIN = process.env.DEFAULT_FINANCE_PIN || "2411";
const DEFAULT_ADMIN_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD || "Admin2026@";

if (!fs.existsSync(AUTH_BIN_PATH)) {
  fs.writeFileSync(AUTH_BIN_PATH, encryptPassword(DEFAULT_PIN));
  console.log('[AUTH] Created finance PIN file with default PIN:', DEFAULT_PIN);
  console.warn('[SECURITY] ⚠️  CHANGE DEFAULT PIN IMMEDIATELY');
} else {
  const stats = fs.statSync(AUTH_BIN_PATH);
  if (stats.isDirectory()) {
    console.error('[AUTH] ERROR: finance_auth.bin is a directory! Removing and recreating...');
    fs.rmdirSync(AUTH_BIN_PATH, { recursive: true });
    fs.writeFileSync(AUTH_BIN_PATH, encryptPassword(DEFAULT_PIN));
  }
}

if (!fs.existsSync(ADMIN_AUTH_BIN_PATH)) {
  fs.writeFileSync(ADMIN_AUTH_BIN_PATH, encryptPassword(DEFAULT_ADMIN_PASSWORD));
  console.log('[AUTH] Created admin password file with default password');
  console.warn('[SECURITY] ⚠️  CHANGE DEFAULT ADMIN PASSWORD IMMEDIATELY');
} else {
  const stats = fs.statSync(ADMIN_AUTH_BIN_PATH);
  if (stats.isDirectory()) {
    console.error('[AUTH] ERROR: finance_admin_auth.bin is a directory! Removing and recreating...');
    fs.rmdirSync(ADMIN_AUTH_BIN_PATH, { recursive: true });
    fs.writeFileSync(ADMIN_AUTH_BIN_PATH, encryptPassword(DEFAULT_ADMIN_PASSWORD));
  }
}

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

// --- AUTH API ---
app.post("/api/app/login", (req, res) => {
  try {
    const { password } = req.body;
    if (fs.existsSync(AUTH_BIN_PATH)) {
      const encryptedBuffer = fs.readFileSync(AUTH_BIN_PATH);
      const currentPassword = decryptPassword(encryptedBuffer);
      if (password === currentPassword) {
        return res.json({ success: true });
      }
    }
    res.status(401).json({ success: false, message: "Invalid PIN" });
  } catch (error: any) {
    console.error('Error in PIN verification:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post("/api/admin/login", (req, res) => {
  try {
    const { password } = req.body;
    if (password === getAdminPassword()) {
      res.json({ success: true });
    } else {
      res.status(401).json({ success: false, message: "Invalid admin password" });
    }
  } catch (error: any) {
    console.error('Error in admin verification:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post("/api/admin/change-app-pin", (req, res) => {
  try {
    const { adminPassword, newAppPin } = req.body;
    
    if (adminPassword !== getAdminPassword()) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    
    if (!newAppPin || newAppPin.length < 4) {
      return res.status(400).json({ success: false, message: "PIN must be at least 4 characters" });
    }
    
    fs.writeFileSync(AUTH_BIN_PATH, encryptPassword(newAppPin));
    console.log('[AUTH] App PIN changed by admin');
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error changing app PIN:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post("/api/admin/change-admin-password", (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (currentPassword !== getAdminPassword()) {
      return res.status(401).json({ success: false, message: "Current password incorrect" });
    }
    
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: "New password must be at least 6 characters" });
    }
    
    fs.writeFileSync(ADMIN_AUTH_BIN_PATH, encryptPassword(newPassword));
    console.log('[AUTH] Admin password changed successfully');
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error changing admin password:', error);
    res.status(500).json({ success: false, message: 'Server error' });
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
