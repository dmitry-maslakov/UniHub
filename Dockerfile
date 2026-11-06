# build: every dependency, the bundle (rspack puts src and libs in dist)
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
COPY proto ./proto
# postinstall generates the prisma client and the gRPC types
RUN npm ci
COPY web/package.json web/package-lock.json ./web/
RUN npm ci --prefix web
COPY . .
# shown in the web app's user menu
ARG COMMIT_SHA=dev
# the web app's build goes to web/dist, which the app serves
RUN npm run build && VITE_COMMIT_SHA=$COMMIT_SHA npm run build --prefix web

# the app: production dependencies, the bundle and what it reads at runtime
FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
# the prisma client is in the bundle already
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/web/dist ./web/dist
# gRPC loads it from the working directory
COPY proto ./proto
RUN mkdir -p data/blobs && chown -R node:node data
USER node
EXPOSE 3000 50051
CMD ["node", "dist/main.js"]
