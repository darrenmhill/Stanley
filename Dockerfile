FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS production
WORKDIR /app
RUN npm install -g serve@14
COPY --from=build /app/dist ./dist
EXPOSE ${PORT:-3000}
CMD sh -c "serve dist -s -l tcp://0.0.0.0:${PORT:-3000}"
