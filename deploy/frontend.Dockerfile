# Zoustec frontend (Next.js — nextjs-zoustec) — production image
#
# NEXT_PUBLIC_* và BACKEND_INTERNAL_URL phải có Ở BƯỚC BUILD:
#  - NEXT_PUBLIC_*  được inline vào bundle client
#  - BACKEND_INTERNAL_URL chốt rewrites /api/* lúc build (Next 14)
# Render tự truyền env vars làm build-args cho các ARG khai báo dưới đây.

FROM node:20-alpine AS deps
WORKDIR /app
COPY nextjs-zoustec/package.json nextjs-zoustec/package-lock.json ./
# canvas stub (npm overrides "canvas: file:./vendor/canvas-stub") phải có trước npm ci
COPY nextjs-zoustec/vendor ./vendor
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY nextjs-zoustec/ .

ARG NEXT_PUBLIC_LIFF_ID
ARG NEXT_PUBLIC_TENANT_SLUG=bnk
ARG BACKEND_INTERNAL_URL
ENV NEXT_PUBLIC_LIFF_ID=$NEXT_PUBLIC_LIFF_ID \
    NEXT_PUBLIC_TENANT_SLUG=$NEXT_PUBLIC_TENANT_SLUG \
    BACKEND_INTERNAL_URL=$BACKEND_INTERNAL_URL \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app .
EXPOSE 3000
# Render cấp $PORT lúc runtime
CMD ["sh", "-c", "npx next start -H 0.0.0.0 -p ${PORT:-3000}"]
