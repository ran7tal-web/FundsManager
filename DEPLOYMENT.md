# Deployment Guide

## Quick Start

### Option 1: Deploy with Agalgala Server (Recommended)

The finance manager is pre-configured in the agalgala-server docker-compose.yml:

```bash
cd ../agalgala-server
docker-compose up -d
```

Access at: `https://your-domain/finance/`

### Option 2: Standalone Deployment

```bash
docker-compose up -d
```

Access at: `http://localhost:8080`

## First Time Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Build the application**:
   ```bash
   npm run build
   ```

3. **Start with Docker**:
   ```bash
   docker-compose up -d
   ```

## Development Mode

```bash
npm run dev
```

Access at `http://localhost:8080`

## Accessing via Nginx

The finance manager is accessible at `/finance/` when deployed through agalgala-server.

The nginx configuration is already set up in:
`agalgala-server/nginx/conf.d/agalgala.conf`

## Data Persistence

Data is stored in `./data/expenses.db` and mounted as a Docker volume.

To backup:
```bash
cp data/expenses.db data/expenses.db.backup
```

## Updating

```bash
git pull
docker-compose down
docker-compose up -d --build
```

## Troubleshooting

### Port 8080 already in use
```bash
# Stop the container
docker-compose down

# Or change port in docker-compose.yml
```

### Database locked
```bash
# Restart the container
docker-compose restart
```

### Can't connect via nginx
1. Check agalgala-server is running
2. Verify nginx config includes finance-manager upstream
3. Check docker network connectivity
