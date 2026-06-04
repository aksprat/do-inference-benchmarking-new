# Build and run the DigitalOcean Inference Benchmark web app.
# Build:  docker build -t do-bench .
# Run:    docker run -d --name do-bench -p 3000:3000 \
#           -e DO_MODEL_ACCESS_KEY=your_key do-bench

FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build /app ./
EXPOSE 3000
CMD ["npm", "start"]
