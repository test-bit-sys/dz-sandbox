# Stage 1: build all workspace packages
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/control/package.json packages/control/
COPY packages/mock-chargily/package.json packages/mock-chargily/
COPY packages/mock-satim/package.json packages/mock-satim/
COPY packages/mock-yalidine/package.json packages/mock-yalidine/
COPY packages/client/package.json packages/client/
COPY packages/cli/package.json packages/cli/

RUN npm ci --ignore-scripts

COPY packages ./packages
RUN npm run build

# Stage 2: minimal production runtime
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    DZ_SANDBOX_HOST=0.0.0.0 \
    DZ_CONTROL_PORT=4000 \
    DZ_CHARGILY_PORT=4001 \
    DZ_SATIM_PORT=4002 \
    DZ_YALIDINE_PORT=4003 \
    DZ_STORE=memory \
    DZ_SCENARIOS_DIR=/app/scenarios

RUN addgroup -S sandbox && adduser -S sandbox -G sandbox \
    && mkdir -p /app/data /app/scenarios \
    && chown -R sandbox:sandbox /app

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/packages/core/package.json packages/core/
COPY --from=builder /app/packages/core/dist packages/core/dist
COPY --from=builder /app/packages/control/package.json packages/control/
COPY --from=builder /app/packages/control/dist packages/control/dist
COPY --from=builder /app/packages/mock-chargily/package.json packages/mock-chargily/
COPY --from=builder /app/packages/mock-chargily/dist packages/mock-chargily/dist
COPY --from=builder /app/packages/mock-satim/package.json packages/mock-satim/
COPY --from=builder /app/packages/mock-satim/dist packages/mock-satim/dist
COPY --from=builder /app/packages/mock-yalidine/package.json packages/mock-yalidine/
COPY --from=builder /app/packages/mock-yalidine/dist packages/mock-yalidine/dist
COPY --from=builder /app/packages/client/package.json packages/client/
COPY --from=builder /app/packages/client/dist packages/client/dist
COPY --from=builder /app/packages/cli/package.json packages/cli/
COPY --from=builder /app/packages/cli/dist packages/cli/dist

RUN npm ci --omit=dev --omit=optional --ignore-scripts && npm cache clean --force

USER sandbox

EXPOSE 4000 4001 4002 4003

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.DZ_CONTROL_PORT || 4000) + '/__control/health').then(r => { if (!r.ok) process.exit(1); }).catch(() => process.exit(1))"

CMD ["node", "packages/cli/dist/cli.js", "start"]
