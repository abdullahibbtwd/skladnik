# Builds on Linux (Coolify) even when the developer is on Mac.
# Dependencies are always installed inside this image — never copied from the host.
FROM node:22-alpine AS base
RUN apk add --no-cache openssl libc6-compat python3 make g++
WORKDIR /app

FROM base AS deps
ENV CI=true
# Coolify may inject NODE_ENV=production as a build ARG; still install compilers.
ENV NODE_ENV=development
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
RUN npm ci --include=dev

FROM base AS build
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package-lock.json ./
COPY package.json ./
COPY tsconfig.base.json ./
COPY apps/api ./apps/api
COPY packages/shared ./packages/shared
ENV DATABASE_URL="postgresql://skladnik:skladnik@postgres:5432/skladnik"
RUN npm run build --workspace=@skladnik/shared
WORKDIR /app/apps/api
RUN npx prisma generate
RUN npm run build && test -f dist/main.js

FROM node:22-alpine AS runner
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/packages/shared/package.json ./packages/shared/
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/apps/api/package.json ./apps/api/
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY apps/api/docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
WORKDIR /app/apps/api
RUN npx prisma generate
ENV NODE_ENV=production
ENV PORT=3000
ENV SKLADNIK_IN_DOCKER=1
EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]
