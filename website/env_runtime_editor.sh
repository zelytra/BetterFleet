#!/bin/sh

ROOT_DIR=/usr/share/nginx/html

# Replace env vars in JavaScript files
echo "Replacing env constants in JS"
for file in $ROOT_DIR/assets/*.js* $ROOT_DIR/index.html; do
  echo "Processing $file ..."

  sed -i 's|VITE_BACKEND_HOST_PLACEHOLDER|'${VITE_BACKEND_HOST}'|g' $file

done

echo "Starting Nginx"
nginx -g 'daemon off;'
