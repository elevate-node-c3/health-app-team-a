# syntax=docker/dockerfile:1

# --- deps: full install (incl. dev) for the build only ----------------------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# `prepare` runs `husky` to install git hooks, which has nothing to attach to
# in a build context that excludes .git — drop it before installing rather
# than let either stage depend on repo state that was never copied in.
RUN npm pkg delete scripts.prepare && npm ci

# --- build: compile TypeScript -> dist/ --------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- runtime: production deps + compiled output only -------------------------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
# `ts-node` is an optional peer dependency of `typeorm` (for its CLI against
# .ts config) and `typescript` rides in transitively with it; npm pulls both
# into the tree even under --omit=dev because they satisfy a *production*
# dependency's peer requirement, not because they are devDependencies
# themselves. Nothing at runtime requires either — the compiled data source
# never touches ts-node — so they are removed explicitly rather than left as
# dead compiler weight in the image.
RUN npm pkg delete scripts.prepare \
  && npm ci --omit=dev \
  && rm -rf node_modules/typescript node_modules/ts-node \
    node_modules/.bin/tsc node_modules/.bin/tsserver node_modules/.bin/ts-node* \
  && npm cache clean --force

COPY --from=build /app/dist ./dist

USER node
EXPOSE 3000

CMD ["node", "dist/main"]
