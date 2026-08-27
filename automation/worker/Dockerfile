# Worker autónomo (Node 20). Sin build: solo instala pg y arranca el servidor.
FROM node:26-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
CMD ["node", "src/server.js"]
