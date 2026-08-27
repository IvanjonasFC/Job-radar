# Web CRM (Astro SSR, adaptador Node standalone).
# Node 22: Astro 7 exige engines.node >=22.12.0 (su compilador nativo no arranca
# en Node 20). Base slim (glibc) + lockfile con `npm ci` = build reproducible con
# las mismas versiones y binarios nativos que en local.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3010
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
EXPOSE 3010
CMD ["node", "./dist/server/entry.mjs"]
