# ══════════════════════════════════════════════════════════════════════════════
# Stage 1 — Builder
# Installs Node dependencies and compiles the React app into static files.
# Node, npm, and source code are NOT carried over to the final image.
# ══════════════════════════════════════════════════════════════════════════════
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package.json first so npm install is cached when only source files change.
COPY package.json ./
RUN npm install

# Copy the rest of the source code.
COPY . .

# VITE_API_URL controls where the React app sends API requests.
# - Leave empty (default) when running with Docker Compose — Nginx proxies all
#   API routes to the backend container so no absolute URL is needed.
# - Set to your backend URL (e.g. https://api.example.com) when deploying the
#   frontend separately on Vercel or Render Static Sites.
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL

# Build the production bundle into /app/dist.
RUN npm run build


# ══════════════════════════════════════════════════════════════════════════════
# Stage 2 — Runtime
# Serves the compiled static files with Nginx.
# The final image contains no Node, npm, or source code — only the built assets.
# ══════════════════════════════════════════════════════════════════════════════
FROM nginx:alpine AS runtime

# Copy compiled assets from the builder stage.
COPY --from=builder /app/dist /usr/share/nginx/html

# Replace the default Nginx config with our custom one.
# nginx.conf proxies /auth, /products, /orders, etc. to the backend service
# and serves everything else as the React SPA.
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Document the port Nginx listens on.
EXPOSE 80

# Start Nginx in the foreground (required for Docker).
CMD ["nginx", "-g", "daemon off;"]
