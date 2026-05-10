FROM node:20-slim

# Install python3 (required by yt-dlp inside youtube-dl-exec)
RUN apt-get update && apt-get install -y python3 --no-install-recommends && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --omit=dev || npm ci

# Copy source and build TypeScript
COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
