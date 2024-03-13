FROM node:latest as build-stage
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:latest as production-build
COPY ./nginx.conf /etc/nginx/nginx.conf

## Remove default nginx index page
RUN rm -rf /usr/share/nginx/html/*

# Copy from the stage 1
COPY --from=build-stage /app/dist /usr/share/nginx/html
COPY ./env_runtime_editor.sh /env_runtime_editor.sh
RUN chmod +x /env_runtime_editor.sh

EXPOSE 80
ENTRYPOINT ["/env_runtime_editor.sh"]
# CMD ["nginx", "-g", "daemon off;"]