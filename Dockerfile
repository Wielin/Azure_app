FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json .npmrc* ./
RUN npm install
COPY . .
RUN npm run build

FROM node:22-alpine AS production
WORKDIR /app
RUN mkdir -p /app/data
COPY --from=builder /app/build ./build
EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production
CMD ["node", "build"]