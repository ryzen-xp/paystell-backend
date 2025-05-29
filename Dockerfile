FROM node:18-alpine
WORKDIR /app
# Install netcat for database health check and build tools for native modules
RUN apk add --no-cache netcat-openbsd python3 make g++

COPY package*.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci && npm rebuild

COPY . .

# Build the application
RUN npm run build

# Remove dev dependencies for production
RUN npm ci --only=production && npm cache clean --force

EXPOSE 4000

CMD ["node", "dist/index.js"]