FROM node:22-bookworm-slim

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /app

RUN apt-get update \
    && apt-get install --yes --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/app/client/package.json packages/app/client/package.json
COPY packages/app/server/package.json packages/app/server/package.json
COPY packages/app/work-bridge/package.json packages/app/work-bridge/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/utils/package.json packages/utils/package.json

RUN HUSKY=0 pnpm install --frozen-lockfile

COPY packages ./packages

RUN pnpm run prisma:generate && pnpm --filter server run build

EXPOSE 3000

CMD ["sh", "-c", "pnpm --filter @job-search-facilitator/core run db:deploy && exec node packages/app/server/dist/server.js"]
