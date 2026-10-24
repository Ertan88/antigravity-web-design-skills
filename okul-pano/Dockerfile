# Okul Pano: API + yönetim paneli + pano tek kapsayıcıda
# Derleme: docker build -t okul-pano .

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/admin/package.json apps/admin/
COPY apps/display/package.json apps/display/
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/admin/package.json apps/admin/
COPY apps/display/package.json apps/display/
RUN npm ci --omit=dev --workspace=@okulpano/api && npm cache clean --force
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/drizzle apps/api/drizzle
COPY --from=build /app/apps/api/seed-assets apps/api/seed-assets
COPY --from=build /app/apps/admin/dist apps/admin/dist
COPY --from=build /app/apps/display/dist apps/display/dist

WORKDIR /app/apps/api
RUN mkdir -p uploads data && chown -R node:node uploads data
USER node
EXPOSE 3000
VOLUME ["/app/apps/api/uploads"]
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "dist/index.js"]
