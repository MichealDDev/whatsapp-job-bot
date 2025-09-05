# Use official Node.js runtime as base image
FROM node:18-alpine

# Set working directory inside container
WORKDIR /app

# Copy package.json first (for better Docker caching)
COPY package.json ./

# Install dependencies
RUN npm ci --only=production --no-audit --no-fund

# Copy all source code
COPY . .

# Create directories that bot needs
RUN mkdir -p /tmp/data /tmp/auth_info

# Expose port for Railway health checks
EXPOSE 3000

# Command to run when container starts
CMD ["npm", "start"]
