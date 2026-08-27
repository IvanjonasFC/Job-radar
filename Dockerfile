# Web CRM (Astro SSR, adaptador Node standalone).
# Build + runtime en Node 20 slim (glibc): evita los fallos de binarios nativos
# (Tailwind v4 oxide / lightningcss) que sufre Alpine (musl), y usa el lockfile
# con `npm ci` para instalar exactamente las mismas versiones que en local.
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim AS run
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3010
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
EXPOSE 3010
CMD ["node", "./dist/server/entry.mjs"]
