# syntax=docker/dockerfile:1

# ---------- Build stage ----------
FROM node:20 AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts

RUN npx prisma generate
RUN npm run build

# ---------- Runtime stage ----------
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/prisma ./prisma

EXPOSE 8080

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/index.js"]
