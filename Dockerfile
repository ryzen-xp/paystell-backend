FROM node:18-alpine

WORKDIR /app

# Install netcat for database health check and build tools for native modules
RUN apk add --no-cache netcat-openbsd python3 make g++

COPY package*.json ./

# Install dependencies and rebuild native modules
RUN npm ci --only=production && npm rebuild

COPY . .

# Build the TypeScript code
RUN npm run build

# Remove devDependencies after build to reduce image size
RUN npm prune --production

EXPOSE 4000

CMD ["node", "dist/index.js"]