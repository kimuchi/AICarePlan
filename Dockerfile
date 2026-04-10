# ── Stage 1: Build client ──
FROM node:20-slim AS client-build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json tsconfig.server.json vite.config.ts ./
COPY client/ client/
RUN npm run build:client

# ── Stage 2: Build server ──
FROM node:20-slim AS server-build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json tsconfig.server.json ./
COPY server/ server/
RUN npm run build:server

# ── Stage 3: Production ──
FROM node:20-slim AS production
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY --from=client-build /app/dist/client ./dist/client
COPY --from=server-build /app/dist/server ./dist/server
COPY docs/ ./docs/
EXPOSE 8080
ENV PORT=8080
CMD ["node", "dist/server/index.js"]
