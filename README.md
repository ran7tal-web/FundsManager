# Agalgala Finance Manager

A clean, Excel-like expense tracking application integrated with the Agalgala ecosystem.

## Features

- **Excel-like Interface**: Simple table-based expense management
- **Multi-view Support**: View expenses by day, week, month, quarter, or year
- **Real-time Sync**: Socket.io notifications when other users make changes
- **SQLite Database**: Persistent data storage with mounted volume
- **Dark Mode**: Toggle between light and dark themes
- **Responsive**: Desktop-first design (mobile view coming soon)

## Tech Stack

- React 19 + TypeScript
- Vite
- Express + Socket.io
- SQLite3
- TailwindCSS
- Docker

## Development

```bash
npm install
npm run dev
```

Access at `http://localhost:8080`

## Production Deployment

### Standalone
```bash
docker-compose up -d
```

### With Agalgala Server (Recommended)
The finance manager is already integrated into the agalgala-server deployment:

```bash
cd ../agalgala-server
docker-compose up -d
```

Access at `https://your-domain/finance/`

## API Endpoints

- `GET /api/expenses?start=YYYY-MM-DD&end=YYYY-MM-DD` - Get expenses
- `POST /api/expenses` - Add expense
- `PUT /api/expenses/:id` - Update expense
- `DELETE /api/expenses/:id` - Delete expense
- `GET /api/summary?start=YYYY-MM-DD&end=YYYY-MM-DD` - Get summary by category

## Database Schema

```sql
CREATE TABLE expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  description TEXT NOT NULL,
  amount REAL NOT NULL,
  category TEXT,
  user TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Directory Structure

```
FundsManager/
├── server/           # Express backend
│   └── index.ts
├── src/              # React frontend
│   ├── App.tsx
│   ├── main.tsx
│   └── lib/
├── data/             # SQLite database (mounted volume)
├── dist/             # Built files
├── Dockerfile
├── docker-compose.yml
└── package.json
```

## Notes

- Data persists in `./data/expenses.db`
- Socket.io notifications keep users in sync
- No real-time collaboration, refresh to see changes
- Uses same folder structure as other Agalgala projects