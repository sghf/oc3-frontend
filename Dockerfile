# Production image: the static build served by an unprivileged nginx, which also
# proxies /api and /realtime to oc3 so that the browser sees a single origin.
#
#   docker build \
#     --build-arg VERSION="$(git describe --tags --always)" \
#     --build-arg BUILDTIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
#     -t opensvc/oc3-frontend .

FROM node:24.22-alpine AS builder

WORKDIR /app

# Dependencies first, so that a source change keeps this layer cached.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.28-alpine

ARG BUILDTIME
ARG VERSION

# Read by the image's entrypoint, which renders /etc/nginx/templates/*.template
# into /etc/nginx/conf.d with these values. Override them at run time.
ENV OC3_API_UPSTREAM=http://oc3-server:8081 \
    OC3_REALTIME_UPSTREAM=http://oc3-messenger:8889 \
    OC3_LISTEN_PORT=8080 \
    OC3_MAX_BODY_SIZE=32m

COPY deploy/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY deploy/nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null "http://127.0.0.1:${OC3_LISTEN_PORT}/healthz" || exit 1

LABEL \
    org.opencontainers.image.authors="OpenSVC SAS" \
    org.opencontainers.image.created="${BUILDTIME}" \
    org.opencontainers.image.version="${VERSION}" \
    org.opencontainers.image.licenses="Apache-2.0" \
    org.opencontainers.image.url="https://github.com/opensvc/oc3-frontend"
