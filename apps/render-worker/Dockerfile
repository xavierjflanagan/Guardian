# Render.com Dockerfile for V3 Worker
FROM node:18-alpine

# Install system dependencies for healthcare document processing
RUN apk add --no-cache \
    imagemagick \
    ghostscript \
    poppler-utils \
    tesseract-ocr \
    && rm -rf /var/cache/apk/*

# Set working directory
WORKDIR /app

# Enable corepack for pnpm
RUN corepack enable

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install dependencies
RUN pnpm install --frozen-lockfile --production

# Copy source code
COPY . .

# Build TypeScript
RUN pnpm run build

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S worker -u 1001
USER worker

# Expose health check port
EXPOSE 10000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:10000/health || exit 1

# Start worker
CMD ["pnpm", "start"]