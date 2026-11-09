# The functions-sync service. Built by Coolify from this repo (build context: the repo root) on every push to main.
# It bakes supabase/functions/deploy-manifest.json's files into the image with their checksums and serves them to the
# edge-functions container, which pulls them with supabase/functions/_deploy/sync.sh. See docs/DEPLOY-FUNCTIONS.md.
FROM node:22-alpine
WORKDIR /app
ARG SOURCE_COMMIT=""
ENV SOURCE_COMMIT=$SOURCE_COMMIT
COPY supabase/functions ./src-functions
COPY deploy/functions-sync/build-manifest.mjs deploy/functions-sync/server.mjs ./
RUN node build-manifest.mjs ./src-functions ./dist && rm -rf ./src-functions
ENV PORT=8080
EXPOSE 8080
USER node
CMD ["node", "server.mjs"]
