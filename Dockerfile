FROM node:18-alpine AS base

WORKDIR /app

COPY package*.json ./

FROM base AS dependencies
RUN npm ci --only=production && npm cache clean --force

FROM base AS build
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

RUN mkdir -p logs

EXPOSE 5000

USER node

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/health || exit 1

CMD ["node", "src/server.js"]
