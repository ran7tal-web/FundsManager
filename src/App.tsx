import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Plus, Trash2, TrendingUp, ChevronDown } from 'lucide-react';
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
  const [viewMode, setViewMode] = useState<ViewMode>('today');
  const [socket, setSocket] = useState<Socket | null>(null);
  const today = new Date().toISOString().split('T')[0];
  const [newExpense, setNewExpense] = useState({ date: today, description: '', amount: '', category: '' });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const categoryRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (categoryRef.current && !categoryRef.current.contains(event.target as Node)) {
        setShowCategoryDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && newExpense.date && newExpense.description && newExpense.amount) {
      e.preventDefault();
      addExpense();
    }
  };

  const fetchExpenses = async () => {
    try {
      const { start, end } = getDateRange();
      console.log('Fetching expenses:', { start, end });
      const res = await fetch(`./api/expenses?start=${start}&end=${end}`);
      
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      
      const data = await res.json();
      console.log('Fetched expenses:', data);
      setExpenses(data);
    } catch (error) {
      console.error('Error fetching expenses:', error);
      toast.error('שגיאה בטעינת הוצאות');
    }
  };

  const addExpense = async () => {
    if (!newExpense.date || !newExpense.description || !newExpense.amount) {
      toast.error('יש למלא את כל השדות');
      return;
    }
    
    try {
      const res = await fetch('./api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newExpense, amount: parseFloat(newExpense.amount), user: 'user1' }),
      });
      
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      
      const expense = await res.json();
      setExpenses(prev => [expense, ...prev]);
      const today = new Date().toISOString().split('T')[0];
      setNewExpense({ date: today, description: '', amount: '', category: '' });
      toast.success('הוצאה נוספה');
    } catch (error) {
      console.error('Error adding expense:', error);
      toast.error('שגיאה בהוספת הוצאה');
    }
  };

  const updateExpense = async (id: number, updates: Partial<Expense>) => {
    const expense = expenses.find(e => e.id === id);
    if (!expense) return;
    
    await fetch(`./api/expenses/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...expense, ...updates }),
    });
    
    setExpenses(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
    setEditingId(null);
  };

  const deleteExpense = async (id: number) => {
    try {
      await fetch(`./api/expenses/${id}`, { method: 'DELETE' });
      setExpenses(prev => prev.filter(e => e.id !== id));
      toast.success('הוצאה נמחקה');
    } catch (error) {
      console.error('Error deleting expense:', error);
      toast.error('שגיאה במחיקת הוצאה');
    }
  };

  const total = expenses.reduce((sum, e) => sum + e.amount, 0);
  
  // Group by category for visualization
  const categoryTotals = expenses.reduce((acc, e) => {
    acc[e.category || 'אחר'] = (acc[e.category || 'אחר'] || 0) + e.amount;
    return acc;
  }, {} as Record<string, number>);
  
  const categories = Object.entries(categoryTotals)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5);
  
  // Get unique categories for dropdown
  const uniqueCategories = Array.from(new Set(expenses.map(e => e.category).filter(Boolean)));

  return (
    <div dir="rtl">
      <div className="min-h-screen bg-white text-gray-900">
        <Toaster position="top-right" richColors />
        
        <div className="container mx-auto p-4 max-w-7xl">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <TrendingUp className="w-8 h-8 text-blue-500" />
              <h1 className="text-3xl font-bold">ניהול כספים</h1>
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
                      : 'bg-gray-200 hover:bg-gray-300
                  }`}
                >
                  {labels[mode]}
                </button>
              );
            })}
          </div>

          {/* Summary with Visual Bar */}
          <div className="mb-6 space-y-4">
            <div className="p-4 bg-blue-50 rounded-lg">
              <div className="text-sm text-gray-600">סך הוצאות</div>
              <div className="text-3xl font-bold text-blue-600">
                ₪{total.toFixed(2)}
              </div>
            </div>
            
            {/* Category Breakdown Bar */}
            {categories.length > 0 && (
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="text-sm font-semibold mb-3 text-gray-700">פילוח לפי קטגוריה</div>
                <div className="space-y-2">
                  {categories.map(([category, amount]) => {
                    const percentage = (amount / total) * 100;
                    return (
                      <div key={category}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium text-gray-900">₪{amount.toFixed(2)} ({percentage.toFixed(1)}%)</span>
                          <span className="text-gray-700">{category || 'אחר'}</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2.5" dir="ltr">
                          <div
                            className="bg-gradient-to-r from-blue-500 to-blue-600 h-2.5 rounded-full transition-all duration-500"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Add Expense Row */}
          <div className="mb-4 p-4 bg-gray-50 rounded-lg">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  addExpense();
                }}
                disabled={!newExpense.date || !newExpense.description || !newExpense.amount}
                className="px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded font-medium flex items-center justify-center gap-2 transition-colors"
              >
                <Plus className="w-4 h-4" /> הוסף
              </button>
              <div className="relative" ref={categoryRef}>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="בחר או הקלד קטגוריה"
                    value={newExpense.category}
                    onChange={(e) => setNewExpense({ ...newExpense, category: e.target.value })}
                    onFocus={() => setShowCategoryDropdown(true)}
                    onKeyDown={handleKeyDown}
                    className="w-full px-3 py-2 pl-8 rounded bg-white border border-gray-300 text-right"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  >
                    <ChevronDown className={`w-4 h-4 transition-transform ${showCategoryDropdown ? 'rotate-180' : ''}`} />
                  </button>
                </div>
                {showCategoryDropdown && uniqueCategories.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded shadow-lg max-h-48 overflow-y-auto">
                    {uniqueCategories.map(cat => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => {
                          setNewExpense({ ...newExpense, category: cat });
                          setShowCategoryDropdown(false);
                        }}
                        className="w-full px-3 py-2 text-right text-gray-900 hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-b-0"
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input
                type="number"
                step="0.01"
                placeholder="סכום (₪)"
                value={newExpense.amount}
                onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
                onKeyDown={handleKeyDown}
                className="px-3 py-2 rounded bg-white border border-gray-300 text-right"
              />
              <input
                type="text"
                placeholder="תיאור"
                value={newExpense.description}
                onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
                onKeyDown={handleKeyDown}
                className="px-3 py-2 rounded bg-white border border-gray-300 text-right"
              />
              <input
                type="date"
                value={newExpense.date}
                onChange={(e) => setNewExpense({ ...newExpense, date: e.target.value })}
                onKeyDown={handleKeyDown}
                className="px-3 py-2 rounded bg-white border border-gray-300 text-right"
              />
            </div>
          </div>

          {/* Expenses Table */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-3 text-right text-sm font-semibold">פעולות</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold">קטגוריה</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold">סכום</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold">תיאור</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold">תאריך</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((expense) => (
                  <tr
                    key={expense.id}
                    className="border-t border-gray-200 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3 text-sm text-right">
                      <div className="flex gap-2 justify-end">
                        {editingId === expense.id ? (
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-green-600 hover:text-green-700"
                          >
                            שמור
                          </button>
                        ) : (
                          <button
                            onClick={() => setEditingId(expense.id)}
                            className="text-blue-600 hover:text-blue-700"
                          >
                            ערוך
                          </button>
                        )}
                        <button
                          onClick={() => deleteExpense(expense.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      {editingId === expense.id ? (
                        <input
                          type="text"
                          list="categories"
                          value={expense.category}
                          onChange={(e) => updateExpense(expense.id, { category: e.target.value })}
                          className="w-full px-2 py-1 rounded bg-white border border-gray-300 text-right"
                        />
                      ) : (
                        expense.category || 'אחר'
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-right">
                      {editingId === expense.id ? (
                        <input
                          type="number"
                          step="0.01"
                          value={expense.amount}
                          onChange={(e) => updateExpense(expense.id, { amount: parseFloat(e.target.value) })}
                          className="w-full px-2 py-1 rounded bg-white border border-gray-300 text-right"
                        />
                      ) : (
                        `₪${expense.amount.toFixed(2)}`
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      {editingId === expense.id ? (
                        <input
                          type="text"
                          value={expense.description}
                          onChange={(e) => updateExpense(expense.id, { description: e.target.value })}
                          className="w-full px-2 py-1 rounded bg-white border border-gray-300 text-right"
                        />
                      ) : (
                        expense.description
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      {editingId === expense.id ? (
                        <input
                          type="date"
                          value={expense.date}
                          onChange={(e) => updateExpense(expense.id, { date: e.target.value })}
                          className="w-full px-2 py-1 rounded bg-white border border-gray-300 text-right"
                        />
                      ) : (
                        expense.date
                      )}
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
