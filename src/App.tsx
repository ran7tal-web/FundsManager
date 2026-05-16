import { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { Plus, Trash2, Moon, Sun, Calendar, TrendingUp } from 'lucide-react';
import { toast, Toaster } from 'sonner';

interface Expense {
  id: number;
  date: string;
  description: string;
  amount: number;
  category: string;
  user: string;
}

type ViewMode = 'today' | 'week' | 'month' | 'quarter' | 'year';

export default function App() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [darkMode, setDarkMode] = useState(true);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [newExpense, setNewExpense] = useState({ date: '', description: '', amount: '', category: '' });
  const [editingId, setEditingId] = useState<number | null>(null);

  useEffect(() => {
    const s = io({ path: '/finance/socket.io' });
    setSocket(s);
    
    s.on('expense-added', (expense) => {
      setExpenses(prev => [expense, ...prev]);
      toast.success('משתמש אחר הוסיף הוצאה');
    });
    
    s.on('expense-updated', (expense) => {
      setExpenses(prev => prev.map(e => e.id === expense.id ? expense : e));
      toast.info('משתמש אחר עדכן הוצאה');
    });
    
    s.on('expense-deleted', ({ id }) => {
      setExpenses(prev => prev.filter(e => e.id !== id));
      toast.info('משתמש אחר מחק הוצאה');
    });
    
    return () => { s.close(); };
  }, []);

  useEffect(() => {
    fetchExpenses();
  }, [viewMode]);

  const getDateRange = () => {
    const now = new Date();
    let start = new Date();
    
    switch (viewMode) {
      case 'today':
        start.setHours(0, 0, 0, 0);
        break;
      case 'week':
        start.setDate(now.getDate() - 7);
        break;
      case 'month':
        start.setMonth(now.getMonth() - 1);
        break;
      case 'quarter':
        start.setMonth(now.getMonth() - 3);
        break;
      case 'year':
        start.setFullYear(now.getFullYear() - 1);
        break;
    }
    
    return { start: start.toISOString().split('T')[0], end: now.toISOString().split('T')[0] };
  };

  const fetchExpenses = async () => {
    const { start, end } = getDateRange();
    const res = await fetch(`/api/expenses?start=${start}&end=${end}`);
    const data = await res.json();
    setExpenses(data);
  };

  const addExpense = async () => {
    if (!newExpense.date || !newExpense.description || !newExpense.amount) return;
    
    const res = await fetch('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newExpense, amount: parseFloat(newExpense.amount), user: 'user1' }),
    });
    
    const expense = await res.json();
    setExpenses(prev => [expense, ...prev]);
    setNewExpense({ date: '', description: '', amount: '', category: '' });
    toast.success('הוצאה נוספה');
  };

  const updateExpense = async (id: number, updates: Partial<Expense>) => {
    const expense = expenses.find(e => e.id === id);
    if (!expense) return;
    
    await fetch(`/api/expenses/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...expense, ...updates }),
    });
    
    setExpenses(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
    setEditingId(null);
  };

  const deleteExpense = async (id: number) => {
    await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
    setExpenses(prev => prev.filter(e => e.id !== id));
    toast.success('הוצאה נמחקה');
  };

  const total = expenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors">
        <Toaster position="top-right" />
        
        <div className="container mx-auto p-4 max-w-7xl">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <TrendingUp className="w-8 h-8 text-blue-500" />
              <h1 className="text-3xl font-bold">ניהול כספים</h1>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => setDarkMode(!darkMode)}
                className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* View Mode Selector */}
          <div className="flex gap-2 mb-6 overflow-x-auto">
            {(['today', 'week', 'month', 'quarter', 'year'] as ViewMode[]).map(mode => {
              const labels = { today: 'היום', week: 'שבוע', month: 'חודש', quarter: 'רבעון', year: 'שנה' };
              return (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    viewMode === mode
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'
                  }`}
                >
                  {labels[mode]}
                </button>
              );
            })}
          </div>

          {/* Summary */}
          <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <div className="text-sm text-gray-600 dark:text-gray-400">סך הוצאות</div>
            <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
              ₪{total.toFixed(2)}
            </div>
          </div>

          {/* Add Expense Row */}
          <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <input
                type="date"
                value={newExpense.date}
                onChange={(e) => setNewExpense({ ...newExpense, date: e.target.value })}
                className="px-3 py-2 rounded bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600"
              />
              <input
                type="text"
                placeholder="תיאור"
                value={newExpense.description}
                onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
                className="px-3 py-2 rounded bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600"
              />
              <input
                type="number"
                step="0.01"
                placeholder="סכום"
                value={newExpense.amount}
                onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
                className="px-3 py-2 rounded bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600"
              />
              <input
                type="text"
                placeholder="קטגוריה"
                value={newExpense.category}
                onChange={(e) => setNewExpense({ ...newExpense, category: e.target.value })}
                className="px-3 py-2 rounded bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600"
              />
              <button
                onClick={addExpense}
                className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded font-medium flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" /> הוסף
              </button>
            </div>
          </div>

          {/* Expenses Table */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-100 dark:bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-right text-sm font-semibold">תאריך</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold">תיאור</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold">סכום</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold">קטגוריה</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((expense) => (
                  <tr
                    key={expense.id}
                    className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  >
                    <td className="px-4 py-3 text-sm text-right">
                      {editingId === expense.id ? (
                        <input
                          type="date"
                          value={expense.date}
                          onChange={(e) => updateExpense(expense.id, { date: e.target.value })}
                          className="w-full px-2 py-1 rounded bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500"
                        />
                      ) : (
                        expense.date
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      {editingId === expense.id ? (
                        <input
                          type="text"
                          value={expense.description}
                          onChange={(e) => updateExpense(expense.id, { description: e.target.value })}
                          className="w-full px-2 py-1 rounded bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500"
                        />
                      ) : (
                        expense.description
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-right">
                      {editingId === expense.id ? (
                        <input
                          type="number"
                          step="0.01"
                          value={expense.amount}
                          onChange={(e) => updateExpense(expense.id, { amount: parseFloat(e.target.value) })}
                          className="w-full px-2 py-1 rounded bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500"
                        />
                      ) : (
                        `₪${expense.amount.toFixed(2)}`
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      {editingId === expense.id ? (
                        <input
                          type="text"
                          value={expense.category}
                          onChange={(e) => updateExpense(expense.id, { category: e.target.value })}
                          className="w-full px-2 py-1 rounded bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500"
                        />
                      ) : (
                        expense.category
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      <div className="flex gap-2">
                        {editingId === expense.id ? (
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-green-600 hover:text-green-700 dark:text-green-400"
                          >
                            שמור
                          </button>
                        ) : (
                          <button
                            onClick={() => setEditingId(expense.id)}
                            className="text-blue-600 hover:text-blue-700 dark:text-blue-400"
                          >
                            ערוך
                          </button>
                        )}
                        <button
                          onClick={() => deleteExpense(expense.id)}
                          className="text-red-600 hover:text-red-700 dark:text-red-400"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
