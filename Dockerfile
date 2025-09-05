# Use official Node.js runtime as base image
FROM node:18-alpine

# Set working directory inside container
WORKDIR /app

# Copy package.json first (for better Docker caching)
COPY package.json ./

# Copy package-lock.json if it exists
COPY package-loc[k].json ./

# Install dependencies (fallback to npm install if no lock file)
RUN if [ -f package-lock.json ]; then \
        npm ci --omit=dev --no-audit --no-fund; \
    else \
        npm install --omit=dev --no-audit --no-fund; \
    fi

# Copy all source code
COPY . .

# Create directories that your bot needs
RUN mkdir -p /tmp/data /tmp/auth_info

# Expose port for Railway health checks
EXPOSE 3000

# Command to run when container starts
CMD ["npm", "start"]
