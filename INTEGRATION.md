# Integration with Agalgala Server

## Overview

FundsManager is fully integrated with the agalgala-server deployment system.

## What's Configured

### 1. Docker Compose
- Added to `agalgala-server/docker-compose.yml`
- Builds from `../FundsManager`
- Data volume mounted at `/app/data`
- Exposed on internal network at port 8080

### 2. Nginx Routing
- Accessible at `/finance/` path
- WebSocket support for Socket.io enabled
- Upstream: `finance-manager:8080`

### 3. Deployment Scripts
Both Linux and Windows deployment scripts updated:
- `agalgala-server/deploy.sh` - Clones/updates FundsManager
- `agalgala-server/deploy.ps1` - Windows deployment

## Deployment

### Quick Deploy
```bash
cd ../agalgala-server
docker compose up -d --build
```

### Full Deployment (with repo updates)
```bash
cd ../agalgala-server
./deploy.sh       # Linux
# OR
./deploy.ps1      # Windows
```

## Access Points

- **Local**: `https://localhost/finance/`
- **Production**: `https://troital.com/finance/`

## Testing

1. **Health Check**: `curl https://localhost/health`
2. **Finance UI**: Open browser to `https://localhost/finance/`
3. **WebSocket**: Should auto-connect when accessing the UI

## Troubleshooting

### Can't access /finance/
```bash
# Check service is running
docker ps | grep finance

# Check nginx config
docker exec agalgala-router nginx -t

# View logs
docker logs agalgala-finance-manager
```

### Database issues
```bash
# Check data directory
ls -la ../FundsManager/data/

# Restart service
docker compose restart finance-manager
```

### WebSocket not connecting
- Ensure nginx has WebSocket support enabled (already configured)
- Check browser console for connection errors
- Verify Socket.io path is `/finance/socket.io`

## Directory Structure

```
repos/
├── agalgala-server/        # Nginx router & orchestration
│   ├── nginx/
│   │   └── conf.d/
│   │       └── agalgala.conf  # Finance routing
│   ├── docker-compose.yml     # Finance service defined
│   ├── deploy.sh              # Includes FundsManager
│   └── deploy.ps1             # Includes FundsManager
├── agalgala-queue-manager/    # Queue service
└── FundsManager/              # Finance service (this repo)
    ├── data/                   # SQLite database
    └── dist/                   # Built files
```
