# Multi-stage Production Dockerfile for LangGraph Agents Application

# Stage 1: Dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY apps/agents/package*.json ./apps/agents/
COPY turbo.json ./
COPY langgraph.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/agents/node_modules ./apps/agents/node_modules

# Copy source code
COPY . .

# Build the agents application
WORKDIR /app/apps/agents
RUN npm run build:internal

# Stage 3: Runner
FROM node:20-alpine AS runner
WORKDIR /app

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 langgraph

# Install LangGraph CLI for production
RUN npm install -g @langchain/langgraph-cli

# Copy built application and configuration
COPY --from=builder --chown=langgraph:nodejs /app/apps/agents/dist ./apps/agents/dist
COPY --from=builder --chown=langgraph:nodejs /app/apps/agents/src ./apps/agents/src
COPY --from=builder --chown=langgraph:nodejs /app/apps/agents/package.json ./apps/agents/package.json
COPY --from=builder --chown=langgraph:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=langgraph:nodejs /app/package.json ./package.json
COPY --from=builder --chown=langgraph:nodejs /app/langgraph.json ./langgraph.json

# Create health check script
COPY --chown=langgraph:nodejs docker/agents/healthcheck.js ./healthcheck.js

# Set proper permissions
USER langgraph

# Expose port
EXPOSE 2024

# Set environment variables
ENV NODE_ENV=production
ENV PORT=2024
ENV HOSTNAME="0.0.0.0"

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node healthcheck.js

# Start the LangGraph server
CMD ["npx", "@langchain/langgraph-cli", "up", "--port", "2024", "--config", "langgraph.json", "--host", "0.0.0.0"]