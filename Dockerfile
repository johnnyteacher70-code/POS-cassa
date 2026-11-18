# Do'kon Boshqaruv tizimi uchun Dockerfile
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Native C++ modullarini (better-sqlite3, sharp) yig'ish uchun zarur paketlar
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

FROM node:20-bookworm-slim

WORKDIR /app

# Ishlash vaqtida kerak bo'ladigan paketlar
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    TZ=Asia/Tashkent \
    PORT=3000 \
    HOST=0.0.0.0

COPY --from=builder /app/node_modules ./node_modules
COPY . .

# Ma'lumotlar saqlanadigan papka
RUN mkdir -p /app/data

EXPOSE 3000

# Sog'lomlik tekshiruvi (Healthcheck)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/healthz', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

VOLUME ["/app/data"]

CMD ["node", "server/index.js"]
