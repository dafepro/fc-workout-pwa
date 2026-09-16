FROM node:22.20.0-alpine
WORKDIR /app
COPY services/team-world/package.json services/team-world/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY services/team-world/authority.mjs services/team-world/server.mjs ./services/team-world/
COPY app/team-world/world.json ./app/team-world/world.json
USER node
CMD ["node", "services/team-world/server.mjs"]
