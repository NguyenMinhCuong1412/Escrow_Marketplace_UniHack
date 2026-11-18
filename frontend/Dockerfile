# Build from repository root: docker build -f frontend/Dockerfile -t escrow-frontend .
FROM node:20-slim AS builder

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY frontend/ ./

ARG NEXT_PUBLIC_CHAIN_ID=43113
ARG NEXT_PUBLIC_ESCROW_ADDRESS=0x19D053c84941411888f5b9e40c854365fdd4eb00
ARG NEXT_PUBLIC_TOKEN_ADDRESS=0xD0c99809e2F035Bf9d99cCB0593A9cc4B6411F78
ARG NEXT_PUBLIC_DEPLOY_BLOCK=60980241
ARG NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:8000
ARG NEXT_PUBLIC_IPFS_GATEWAY=https://gateway.pinata.cloud/ipfs/
ARG NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=3a8170812b534d0ff9d794f19a901d64

ENV NEXT_PUBLIC_CHAIN_ID=$NEXT_PUBLIC_CHAIN_ID \
    NEXT_PUBLIC_ESCROW_ADDRESS=$NEXT_PUBLIC_ESCROW_ADDRESS \
    NEXT_PUBLIC_TOKEN_ADDRESS=$NEXT_PUBLIC_TOKEN_ADDRESS \
    NEXT_PUBLIC_DEPLOY_BLOCK=$NEXT_PUBLIC_DEPLOY_BLOCK \
    NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL \
    NEXT_PUBLIC_IPFS_GATEWAY=$NEXT_PUBLIC_IPFS_GATEWAY \
    NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=$NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build

FROM node:20-slim AS runner

WORKDIR /app/frontend
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/frontend/package.json ./package.json
COPY --from=builder /app/frontend/next.config.js ./next.config.js
COPY --from=builder /app/frontend/public ./public
COPY --from=builder /app/frontend/.next ./.next
COPY --from=builder /app/frontend/node_modules ./node_modules
COPY docker/frontend-entrypoint.sh /usr/local/bin/frontend-entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/frontend-entrypoint.sh && chmod +x /usr/local/bin/frontend-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/frontend-entrypoint.sh"]
CMD ["./node_modules/.bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]
