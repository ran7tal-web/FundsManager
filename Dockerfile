# --- Build Stage ---
FROM node:20-alpine AS builder
WORKDIR /app
# Install build dependencies for native modules (sqlite3, etc.)
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# --- Production Stage ---
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

# Install production dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy built files
COPY --from=builder /app/dist ./dist

# Create data directory with proper permissions
RUN mkdir -p /app/data && chmod 777 /app/data

EXPOSE 8080
CMD ["node", "dist/server.js"]
