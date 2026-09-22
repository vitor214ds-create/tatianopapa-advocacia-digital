FROM oven/bun:1.4.0 AS build
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
ENV VITE_SUPABASE_PUBLISHABLE_KEY=${VITE_SUPABASE_PUBLISHABLE_KEY}
ENV RAILWAY_ENVIRONMENT=production

RUN bun run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

# The build emits dist/ (client assets + fetch handler); server/node-entry.mjs
# serves both from a single Node process.
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server

EXPOSE 3000
CMD ["node", "server/node-entry.mjs"]
