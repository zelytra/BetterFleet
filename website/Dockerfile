# Build stage
FROM node:22-alpine AS build-stage
WORKDIR /app
# Dependencies first, from the lockfile, so this layer is cached until package*.json changes.
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Serve stage
FROM nginx:1.27-alpine AS production-build
COPY ./nginx.conf /etc/nginx/nginx.conf

## Remove default nginx index page
RUN rm -rf /usr/share/nginx/html/*

# Copy from the build stage
COPY --from=build-stage /app/dist /usr/share/nginx/html
COPY ./env_runtime_editor.sh /env_runtime_editor.sh
RUN sed -i 's/\r$//' /env_runtime_editor.sh && chmod +x /env_runtime_editor.sh

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1

EXPOSE 80
ENTRYPOINT ["/env_runtime_editor.sh"]
