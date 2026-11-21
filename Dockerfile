# Absensi Jamaah — image untuk VPS (tanpa dependensi npm)
FROM node:24-alpine
RUN apk add --no-cache tzdata
ENV TZ=Asia/Jakarta \
    NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/app/data
WORKDIR /app
COPY dev/server.js ./dev/server.js
COPY src ./src
# data/ (db.json, foto, cadangan harian) disimpan di volume, bukan di image
RUN mkdir -p /app/data && chown -R node:node /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=60s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
CMD ["node", "dev/server.js"]
