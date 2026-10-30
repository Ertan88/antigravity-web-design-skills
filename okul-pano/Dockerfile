# Okul Pano: API + yönetim paneli + pano + mobil uygulamanın web sürümü tek kapsayıcıda
# Derleme: docker build -t okul-pano .

# Mobil uygulamanın web sürümü (/app/): telefona uygulama kurmayan öğretmenler tarayıcıdan kullanır
FROM node:22-alpine AS mobile
WORKDIR /app/mobile
COPY mobile/package.json mobile/package-lock.json ./
RUN npm ci
COPY packages/shared /app/packages/shared
COPY mobile ./
RUN npx expo export --platform web --output-dir dist

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/slides/package.json packages/slides/
COPY apps/api/package.json apps/api/
COPY apps/admin/package.json apps/admin/
COPY apps/display/package.json apps/display/
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
LABEL org.opencontainers.image.source=https://github.com/Ertan88/antigravity-web-design-skills
LABEL org.opencontainers.image.description="Okul Pano: okullar için dijital pano, yönetim paneli ve mobil uygulama"
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/slides/package.json packages/slides/
COPY apps/api/package.json apps/api/
COPY apps/admin/package.json apps/admin/
COPY apps/display/package.json apps/display/
RUN npm ci --omit=dev --workspace=@okulpano/api && npm cache clean --force
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/drizzle apps/api/drizzle
COPY --from=build /app/apps/api/seed-assets apps/api/seed-assets
COPY --from=build /app/apps/admin/dist apps/admin/dist
COPY --from=build /app/apps/display/dist apps/display/dist
COPY --from=mobile /app/mobile/dist mobile/dist

WORKDIR /app/apps/api
RUN mkdir -p uploads data && chown -R node:node uploads data
USER node
EXPOSE 3000
VOLUME ["/app/apps/api/uploads"]
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "dist/index.js"]
