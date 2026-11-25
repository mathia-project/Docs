FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_DIRECTUS_URL=http://localhost:8055
ARG VITE_AI_SERVICE_URL=http://localhost:8000
ARG VITE_DEFAULT_LOCALE=en

ENV VITE_DIRECTUS_URL=${VITE_DIRECTUS_URL}
ENV VITE_AI_SERVICE_URL=${VITE_AI_SERVICE_URL}
ENV VITE_DEFAULT_LOCALE=${VITE_DEFAULT_LOCALE}

RUN npm run build

FROM nginx:1.28-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
