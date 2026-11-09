# The agent platform (Mastra + the Ops agent). Coolify builds it from this folder (base directory /agent-platform).
# Settings come from the environment: see README.md for the list. No secret is baked into the image.
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
USER node
CMD ["node", "--import", "tsx", "src/server.ts"]
