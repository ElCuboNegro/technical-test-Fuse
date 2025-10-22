# Docker Development Guide

This guide covers Docker-based development for the multi-agent AI application, including setup, troubleshooting, and best practices.

## Quick Start

### Prerequisites

- Docker Desktop (Windows/Mac) or Docker Engine (Linux)
- Docker Compose v2.0+
- Git

### Environment Setup

1. **Clone the repository and navigate to the project root**

   ```bash
   git clone <repository-url>
   cd <project-directory>
   ```

2. **Copy environment templates**

   ```bash
   cp .env.dev.example .env
   # Edit .env with your specific configuration
   ```

3. **Start development environment**

   ```bash
   docker-compose -f docker-compose.dev.yml up
   ```

4. **Access services**
   - Web App: http://localhost:3000
   - Agents API: http://localhost:2024
   - PostgreSQL: localhost:5432
   - Redis: localhost:6379

## Development Workflow

### Starting Services

**Development Mode (with hot reloading):**

```bash
docker-compose -f docker-compose.dev.yml up
```

**Production Mode:**

```bash
docker-compose up
```

**Start specific services:**

```bash
docker-compose -f docker-compose.dev.yml up web postgres redis
```

### Stopping Services

```bash
# Stop all services
docker-compose -f docker-compose.dev.yml down

# Stop and remove volumes (clears database data)
docker-compose -f docker-compose.dev.yml down -v
```

### Viewing Logs

```bash
# All services
docker-compose -f docker-compose.dev.yml logs

# Specific service
docker-compose -f docker-compose.dev.yml logs web

# Follow logs in real-time
docker-compose -f docker-compose.dev.yml logs -f agents
```

## Environment Configuration

### Environment Variables

The application uses three environment files:

- `.env`: Your local development configuration
- `.env.example`: Production environment template
- `.env.dev.example`: Development environment template

### Key Environment Variables

```bash
# Database Configuration (PostgreSQL with pgvector)
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=agents_app
POSTGRES_USER=app_user
POSTGRES_PASSWORD=secure_password

# Redis Configuration
REDIS_HOST=redis
REDIS_PORT=6379

# Application Configuration
NODE_ENV=development
WEB_PORT=3000
AGENTS_PORT=2024

# AI Service Configuration (optional)
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key
```

## Common Development Tasks

### Database Operations

**Access PostgreSQL shell:**

```bash
docker-compose -f docker-compose.dev.yml exec postgres psql -U app_user -d agents_app
```

**Run database migrations:**

```bash
docker-compose -f docker-compose.dev.yml exec web npm run db:migrate
```

**Seed development data:**

```bash
docker-compose -f docker-compose.dev.yml exec web npm run db:seed
```

**Reset database:**

```bash
docker-compose -f docker-compose.dev.yml exec web npm run db:reset
```

### Redis Operations

**Access Redis CLI:**

```bash
docker-compose -f docker-compose.dev.yml exec redis redis-cli
```

**Clear Redis cache:**

```bash
docker-compose -f docker-compose.dev.yml exec redis redis-cli FLUSHALL
```

### Vector Database Operations (pgvector)

**Access PostgreSQL with vector support:**

```bash
docker-compose -f docker-compose.dev.yml exec postgres psql -U app_user -d agents_app
```

**Test pgvector functionality:**

```sql
-- Check if pgvector extension is installed
SELECT * FROM pg_extension WHERE extname = 'vector';

-- Test vector operations
SELECT '[1,2,3]'::vector <-> '[1,2,4]'::vector as distance;

-- View vector data
SELECT id, content, embedding FROM documents WHERE embedding IS NOT NULL LIMIT 5;
```

**Vector similarity search example:**

```sql
-- Find similar documents (replace with actual embedding)
SELECT document_id, content, 1 - (embedding <=> '[0.1,0.2,0.3,...]'::vector) as similarity
FROM documents
WHERE embedding IS NOT NULL
ORDER BY embedding <=> '[0.1,0.2,0.3,...]'::vector
LIMIT 10;
```

### Application Development

**Install new dependencies:**

```bash
# For web app
docker-compose -f docker-compose.dev.yml exec web npm install <package-name>

# For agents app
docker-compose -f docker-compose.dev.yml exec agents npm install <package-name>
```

**Run tests:**

```bash
# Unit tests
docker-compose -f docker-compose.dev.yml exec web npm test
docker-compose -f docker-compose.dev.yml exec agents npm test

# Integration tests
npm run test:integration
```

**Build applications:**

```bash
docker-compose -f docker-compose.dev.yml exec web npm run build
docker-compose -f docker-compose.dev.yml exec agents npm run build
```

## Troubleshooting

### Common Issues

#### Port Conflicts

**Problem:** Port already in use errors
**Solution:**

```bash
# Check what's using the port
netstat -tulpn | grep :3000

# Stop conflicting services or change ports in docker-compose.dev.yml
```

#### Database Connection Issues

**Problem:** Cannot connect to PostgreSQL
**Solutions:**

1. Ensure PostgreSQL service is running:

   ```bash
   docker-compose -f docker-compose.dev.yml ps postgres
   ```

2. Check database logs:

   ```bash
   docker-compose -f docker-compose.dev.yml logs postgres
   ```

3. Verify environment variables in `.env`

#### Redis Connection Issues

**Problem:** Cannot connect to Redis
**Solutions:**

1. Check Redis service status:

   ```bash
   docker-compose -f docker-compose.dev.yml ps redis
   ```

2. Test Redis connectivity:
   ```bash
   docker-compose -f docker-compose.dev.yml exec redis redis-cli ping
   ```

#### Hot Reloading Not Working

**Problem:** Code changes not reflected in development
**Solutions:**

1. Ensure volume mounts are correct in `docker-compose.dev.yml`
2. Check file permissions (especially on Windows/WSL)
3. Restart the specific service:
   ```bash
   docker-compose -f docker-compose.dev.yml restart web
   ```

#### Build Failures

**Problem:** Docker build fails
**Solutions:**

1. Clear Docker build cache:

   ```bash
   docker system prune -a
   ```

2. Rebuild without cache:

   ```bash
   docker-compose -f docker-compose.dev.yml build --no-cache
   ```

3. Check `.dockerignore` for excluded files

### Health Checks

**Check service health:**

```bash
# Web app health (includes database, Redis, and pgvector status)
curl http://localhost:3000/api/health

# Agents health (includes database, Redis, and pgvector status)
curl http://localhost:2024/health
```

**View health check logs:**

```bash
docker-compose -f docker-compose.dev.yml logs web | grep health
```

### Performance Optimization

**Monitor resource usage:**

```bash
docker stats
```

**Optimize Docker performance:**

1. Increase Docker Desktop memory allocation (4GB+ recommended)
2. Use `.dockerignore` to exclude unnecessary files
3. Use multi-stage builds for production images
4. Enable BuildKit for faster builds:
   ```bash
   export DOCKER_BUILDKIT=1
   ```

## Production Deployment

### Building Production Images

```bash
# Build all production images
docker-compose build

# Build specific service
docker-compose build web
```

### Production Environment

1. **Copy production environment template:**

   ```bash
   cp .env.example .env.production
   # Edit with production values
   ```

2. **Start production services:**

   ```bash
   docker-compose --env-file .env.production up -d
   ```

3. **Monitor production services:**
   ```bash
   docker-compose ps
   docker-compose logs -f
   ```

## Best Practices

### Development

1. **Use development compose file for local development**
2. **Keep environment files secure and never commit sensitive data**
3. **Use named volumes for data persistence**
4. **Regularly update base images for security**
5. **Use health checks to ensure service reliability**

### Code Organization

1. **Keep Dockerfiles in the `docker/` directory**
2. **Use multi-stage builds for production optimization**
3. **Follow the principle of least privilege in containers**
4. **Use specific image tags instead of `latest`**

### Debugging

1. **Use `docker-compose logs` for troubleshooting**
2. **Access container shells for debugging:**
   ```bash
   docker-compose -f docker-compose.dev.yml exec web sh
   ```
3. **Use health check endpoints to verify service status**
4. **Monitor container resource usage with `docker stats`**

## Advanced Usage

### Custom Docker Networks

```bash
# Create custom network
docker network create app-network

# Use in docker-compose.yml
networks:
  default:
    external:
      name: app-network
```

### Volume Management

```bash
# List volumes
docker volume ls

# Inspect volume
docker volume inspect containerization_postgres_data

# Backup volume
docker run --rm -v containerization_postgres_data:/data -v $(pwd):/backup alpine tar czf /backup/postgres_backup.tar.gz -C /data .

# Restore volume
docker run --rm -v containerization_postgres_data:/data -v $(pwd):/backup alpine tar xzf /backup/postgres_backup.tar.gz -C /data
```

### Container Debugging

```bash
# Execute commands in running container
docker-compose -f docker-compose.dev.yml exec web npm run debug

# Access container filesystem
docker-compose -f docker-compose.dev.yml exec web ls -la /app

# Copy files from container
docker cp container_name:/app/logs ./local_logs
```

## Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [PostgreSQL Docker Hub](https://hub.docker.com/_/postgres)
- [Redis Docker Hub](https://hub.docker.com/_/redis)
- [Node.js Docker Best Practices](https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md)
