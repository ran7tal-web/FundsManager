import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Plus, Trash2, TrendingUp, ChevronDown, Download } from 'lucide-react';
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
  const today = getLocalDateString();
  const [newExpense, setNewExpense] = useState({ date: today, description: '', amount: '', category: '' });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingExpense, setEditingExpense] = useState<Partial<Expense> | null>(null);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const categoryRef = useRef<HTMLDivElement>(null);

  function getLocalDateString(date = new Date()) {
    const localDate = new Date(date);
    localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset());
    return localDate.toISOString().split('T')[0];
  }
  
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
    
    return { start: getLocalDateString(start), end: getLocalDateString(now) };
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && newExpense.date && newExpense.description && newExpense.amount) {
      e.preventDefault();
      addExpense();
    }
  };

  const startEditing = (expense: Expense) => {
    setEditingId(expense.id);
    setEditingExpense({ ...expense });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingExpense(null);
  };

  const saveEditedExpense = async () => {
    if (!editingId || !editingExpense) return;
    const updated = {
      ...editingExpense,
      amount: Number(editingExpense.amount || 0),
      date: editingExpense.date || today,
      description: editingExpense.description || '',
      category: editingExpense.category || '',
    } as Expense;

    await fetch(`./api/expenses/${editingId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });

    setExpenses(prev => prev.map(e => e.id === editingId ? updated : e));
    cancelEditing();
  };

  const setEditingField = (field: keyof Expense, value: string | number) => {
    setEditingExpense(prev => prev ? { ...prev, [field]: value } : prev);
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
      const today = getLocalDateString();
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

  const exportToCSV = () => {
    if (expenses.length === 0) {
      toast.error('אין הוצאות לייצוא');
      return;
    }

    // CSV Headers in Hebrew
    const headers = ['תאריך', 'תיאור', 'סכום', 'קטגוריה', 'משתמש'];
    const csvContent = [
      headers.join(','),
      ...expenses.map(e => [
        e.date,
        `"${e.description.replace(/"/g, '""')}"`,
        e.amount.toFixed(2),
        `"${(e.category || 'אחר').replace(/"/g, '""')}"`,
        e.user
      ].join(','))
    ].join('\n');

    // Add BOM for proper Hebrew encoding in Excel
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    const { start, end } = getDateRange();
    const viewLabels = { today: 'היום', week: 'שבוע', month: 'חודש', quarter: 'רבעון', year: 'שנה' };
    const filename = `הוצאות_${viewLabels[viewMode]}_${start}_עד_${end}.csv`;
    
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success('הקובץ יוצא בהצלחה');
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
      <div className="min-h-screen overflow-auto bg-white text-gray-900">
        
        <div className="container mx-auto px-3 sm:px-4 py-4 max-w-7xl">
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
            <div className="flex items-center gap-4">
              <TrendingUp className="w-8 h-8 text-blue-500" />
              <h1 className="text-2xl sm:text-3xl font-bold">ניהול כספים</h1>
            </div>
            <button
              onClick={exportToCSV}
              disabled={expenses.length === 0}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg font-bold flex items-center gap-2 transition-colors shadow-md active:scale-95"
            >
              <Download className="w-4 h-4" />
              ייצוא לרואה חשבון (CSV)
            </button>
          </div>

          {/* View Mode Selector */}
          <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent">
            {(['today', 'week', 'month', 'quarter', 'year'] as ViewMode[]).map(mode => {
              const labels = { today: 'היום', week: 'שבוע', month: 'חודש', quarter: 'רבעון', year: 'שנה' };
              return (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${
                    viewMode === mode
                      ? 'bg-blue-500 text-white'
                      : 'bg-slate-200 hover:bg-slate-300'
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
                        <div className="flex flex-col sm:flex-row justify-between text-sm mb-1 gap-1">
                          <span className="font-medium text-gray-900 order-2 sm:order-1">₪{amount.toFixed(2)} ({percentage.toFixed(1)}%)</span>
                          <span className="text-gray-700 font-semibold order-1 sm:order-2">{category || 'אחר'}</span>
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
          <div className="mb-4 p-3 sm:p-4 bg-slate-100 rounded-2xl">
            <div className="flex flex-col sm:grid sm:grid-cols-2 md:grid-cols-5 gap-2 sm:gap-3">
              <input
                type="date"
                value={newExpense.date}
                onChange={(e) => setNewExpense({ ...newExpense, date: e.target.value })}
                onKeyDown={handleKeyDown}
                className="h-10 md:h-10 px-3 py-2 rounded-xl bg-white border-2 border-slate-200 text-right font-medium"
              />
              <input
                type="text"
                placeholder="תיאור"
                value={newExpense.description}
                onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
                onKeyDown={handleKeyDown}
                className="h-10 md:h-10 px-3 py-2 rounded-xl bg-white border-2 border-slate-200 text-right font-medium"
              />
              <input
                type="number"
                step="0.01"
                placeholder="סכום (₪)"
                value={newExpense.amount}
                onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
                onKeyDown={handleKeyDown}
                className="h-10 md:h-10 px-3 py-2 rounded-xl bg-white border-2 border-slate-200 text-right font-medium"
              />
              <div className="relative" ref={categoryRef}>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="בחר או הקלד קטגוריה"
                    value={newExpense.category}
                    onChange={(e) => setNewExpense({ ...newExpense, category: e.target.value })}
                    onFocus={() => setShowCategoryDropdown(true)}
                    onKeyDown={handleKeyDown}
                    className="w-full h-10 md:h-10 px-3 py-2 pl-8 rounded-xl bg-white border-2 border-slate-200 text-right font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-800"
                  >
                    <ChevronDown className={`w-4 h-4 transition-transform ${showCategoryDropdown ? 'rotate-180' : ''}`} />
                  </button>
                </div>
                {showCategoryDropdown && uniqueCategories.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border-2 border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {uniqueCategories.map(cat => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => {
                          setNewExpense({ ...newExpense, category: cat });
                          setShowCategoryDropdown(false);
                        }}
                        className="w-full px-3 py-2 text-right text-slate-800 hover:bg-blue-100 transition-colors border-b border-slate-100 last:border-b-0 font-medium"
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  addExpense();
                }}
                disabled={!newExpense.date || !newExpense.description || !newExpense.amount}
                className="h-10 md:h-10 sm:col-span-2 md:col-span-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl font-black flex items-center justify-center gap-2 transition-colors shadow-md active:scale-95"
              >
                <Plus className="w-4 h-4" /> הוסף
              </button>
            </div>
          </div>

          {/* Expenses Table */}
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden border-2 border-slate-100">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="bg-slate-100 border-b-2 border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-right text-sm font-black text-slate-700 whitespace-nowrap">פעולות</th>
                  <th className="px-4 py-3 text-right text-sm font-black text-slate-700 whitespace-nowrap">קטגוריה</th>
                  <th className="px-4 py-3 text-right text-sm font-black text-slate-700 whitespace-nowrap">סכום</th>
                  <th className="px-4 py-3 text-right text-sm font-black text-slate-700 whitespace-nowrap">תיאור</th>
                  <th className="px-4 py-3 text-right text-sm font-black text-slate-700 whitespace-nowrap">תאריך</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((expense) => (
                  <tr
                    key={expense.id}
                    className="border-t-2 border-slate-100 hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-4 py-3 text-sm text-right">
                      <div className="flex gap-1 sm:gap-2 justify-end flex-nowrap">
                        {editingId === expense.id ? (
                          <>
                            <button
                              onClick={saveEditedExpense}
                              className="h-8 px-2 sm:px-3 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 font-black text-xs transition-colors active:scale-95 whitespace-nowrap"
                            >
                              שמור
                            </button>
                            <button
                              onClick={cancelEditing}
                              className="h-8 px-2 sm:px-3 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 font-black text-xs transition-colors active:scale-95 whitespace-nowrap"
                            >
                              ביטול
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => startEditing(expense)}
                            className="h-8 px-2 sm:px-3 rounded-lg bg-blue-100 text-blue-600 hover:bg-blue-200 font-black text-xs transition-colors active:scale-95 whitespace-nowrap"
                          >
                            ערוך
                          </button>
                        )}
                        <button
                          onClick={() => deleteExpense(expense.id)}
                          className="h-8 w-8 rounded-lg bg-rose-100 text-rose-600 hover:bg-rose-200 flex items-center justify-center font-black text-xs transition-colors active:scale-95 flex-shrink-0"
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
                          value={editingExpense?.category ?? expense.category}
                          onChange={(e) => setEditingField('category', e.target.value)}
                          className="w-full px-2 py-1 rounded-lg bg-white border-2 border-slate-200 text-right font-medium"
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
                          value={editingExpense?.amount ?? expense.amount}
                          onChange={(e) => setEditingField('amount', e.target.value)}
                          className="w-full px-2 py-1 rounded-lg bg-white border-2 border-slate-200 text-right font-medium"
                        />
                      ) : (
                        `₪${expense.amount.toFixed(2)}`
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      {editingId === expense.id ? (
                        <input
                          type="text"
                          value={editingExpense?.description ?? expense.description}
                          onChange={(e) => setEditingField('description', e.target.value)}
                          className="w-full px-2 py-1 rounded-lg bg-white border-2 border-slate-200 text-right font-medium"
                        />
                      ) : (
                        expense.description
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      {editingId === expense.id ? (
                        <input
                          type="date"
                          value={editingExpense?.date ?? expense.date}
                          onChange={(e) => setEditingField('date', e.target.value)}
                          className="w-full px-2 py-1 rounded-lg bg-white border-2 border-slate-200 text-right font-medium"
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
    </div>
  );
}
