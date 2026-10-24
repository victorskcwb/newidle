# Game server image (docs/plan-fase-1.md, commit 13). Build from the repository root:
#   docker build -f apps/server/Dockerfile --build-arg BUILD_ID=$(git rev-parse --short HEAD) .
# Without DATABASE_URL the server falls back to PGlite in /data (mount a volume there).
# BUILD_ID must match the client's VITE_BUILD_ID, or the server asks the client to reload.
FROM node:24-slim AS build
RUN npm install -g pnpm@10.34.7
WORKDIR /repo
COPY . .
# The workspace packages export TypeScript sources, which tsx runs as they are; `deploy` copies
# them into node_modules with only the production dependencies.
RUN pnpm --filter @abismo/server deploy --prod --legacy /out

FROM node:24-slim
ARG BUILD_ID=dev
ENV NODE_ENV=production BUILD_ID=$BUILD_ID PORT=8787 PGLITE_DIR=/data/pglite
WORKDIR /app
COPY --from=build /out .
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s \
  CMD node -e "fetch('http://localhost:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "--import", "tsx", "src/main.ts"]
