# MEGA SRM — production image (Next.js standalone server + full production node_modules + Prisma)
FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl tzdata ca-certificates && rm -rf /var/lib/apt/lists/*
ENV TZ=Europe/Kyiv NEXT_TELEMETRY_DISABLED=1 LANG=C.UTF-8
WORKDIR /app

# Production dependencies only (incl. prisma CLI for `migrate deploy`) + generated client
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npx prisma generate

FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npx next build

FROM base AS run
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
# Full production node_modules: standalone file tracing can miss files of exceljs' dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY prisma ./prisma
COPY scripts/create-admin.mjs ./scripts/create-admin.mjs
USER node
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]
