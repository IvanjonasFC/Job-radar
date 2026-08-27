# Web CRM (Astro SSR, adaptador Node standalone). Build + runtime en Node 20 alpine.
FROM node:26-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:26-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3010
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
EXPOSE 3010
CMD ["node", "./dist/server/entry.mjs"]
