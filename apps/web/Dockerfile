# Static web build. npm ci runs on Linux so esbuild/vite binaries match Alpine,
# not the Mac host.
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
ENV CI=true
ENV NODE_ENV=development
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
RUN npm ci --include=dev

FROM node:22-alpine AS build
# Chromium for post-build landing prerender (Puppeteer). Skip Puppeteer's own download.
RUN apk add --no-cache libc6-compat chromium nss freetype harfbuzz ca-certificates ttf-freefont
WORKDIR /app
# Coolify may inject NODE_ENV=production as a build ARG; keep tooling available.
ENV NODE_ENV=development
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
# Vite inlines VITE_* at build time into the static bundle — runtime Coolify
# env alone is not enough. Pass these as Docker build args in Coolify.
ARG VITE_ANALYTICS_SCRIPT_URL=
ARG VITE_ANALYTICS_WEBSITE_ID=
ENV VITE_ANALYTICS_SCRIPT_URL=$VITE_ANALYTICS_SCRIPT_URL
ENV VITE_ANALYTICS_WEBSITE_ID=$VITE_ANALYTICS_WEBSITE_ID
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
RUN npm run build --workspace=@skladnik/shared
RUN npm run build --workspace=@skladnik/web

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
