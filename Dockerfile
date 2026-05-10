FROM node:20-slim

# Install python3 (required by yt-dlp inside youtube-dl-exec)
RUN apt-get update && apt-get install -y python3 --no-install-recommends && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy all files first so that postinstall (tsc) has access to tsconfig.json and src/
COPY . .

# Install dependencies (this will automatically run postinstall -> npm run build)
RUN npm ci --omit=dev || npm ci

EXPOSE 3000

CMD ["npm", "start"]
