# Ognivo: Mini App + API + бот в одном контейнере.
# Сборка: docker build -t ognivo .

FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Сначала только манифесты — чтобы слой с зависимостями кэшировался
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/
COPY app/package.json app/
COPY server/package.json server/
RUN npm ci

COPY shared shared
COPY app app
COPY server server
RUN npx prisma generate --schema server/prisma/schema.prisma \
 && npm run build -w app \
 && npm run build -w server

# ── Итоговый образ ──
FROM node:24-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /data && chown node:node /data

COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules node_modules
COPY --from=build --chown=node:node /app/shared shared
COPY --from=build --chown=node:node /app/server/package.json server/
COPY --from=build --chown=node:node /app/server/dist server/dist
COPY --from=build --chown=node:node /app/server/prisma/schema.prisma server/prisma/
COPY --from=build --chown=node:node /app/server/scripts server/scripts
COPY --from=build --chown=node:node /app/app/dist app/dist

ENV NODE_ENV=production \
    API_PORT=3000 \
    STATIC_DIR=/app/app/dist \
    DATABASE_URL=file:/data/ognivo.db \
    DEV_AUTH_BYPASS=false

USER node
EXPOSE 3000
VOLUME /data

# Перед запуском приводим базу к актуальной схеме. Если изменение схемы грозит потерей данных,
# prisma откажется — контейнер не стартует, а данные останутся целы.
CMD ["sh", "-c", "npx prisma db push --skip-generate --schema server/prisma/schema.prisma && exec node server/dist/index.js"]
