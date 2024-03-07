## Deploy backend
``docker run -d -p 8301:8080 zelytra/better-fleet-backend:latest``

## Nginx conf
```nginx configuration
server {

    server_name betterfleet.fr;

    location / {
        proxy_pass http://127.0.0.1:8300;
    }

    location /api {
        rewrite /api/(.*) /$1  break;
        proxy_pass http://127.0.0.1:8301;
        proxy_redirect     off;
        proxy_set_header   Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        # Socket conf
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_hide_header 'Access-Control-Allow-Origin';
        proxy_http_version 1.1;
    }

    listen [::]:80;
    listen 80;
}
```