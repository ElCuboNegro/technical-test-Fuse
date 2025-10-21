import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/database';
import { redis } from '@/lib/redis';
import { vectorService } from '@/lib/vector';

interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  services: {
    database: {
      status: 'healthy' | 'unhealthy';
      responseTime?: number;
      error?: string;
    };
    redis: {
      status: 'healthy' | 'unhealthy';
      responseTime?: number;
      error?: string;
    };
    vector: {
      status: 'healthy' | 'unhealthy';
      responseTime?: number;
      error?: string;
    };
  };
  uptime: number;
}

async function checkDatabaseHealth(): Promise<{ status: 'healthy' | 'unhealthy'; responseTime?: number; error?: string }> {
  const startTime = Date.now();
  
  try {
    // Ensure database is connected
    await database.connect();
    
    // Perform health check
    const isHealthy = await database.healthCheck();
    const responseTime = Date.now() - startTime;
    
    if (isHealthy) {
      return {
        status: 'healthy',
        responseTime
      };
    } else {
      return {
        status: 'unhealthy',
        responseTime,
        error: 'Database health check query failed'
      };
    }
  } catch (error) {
    const responseTime = Date.now() - startTime;
    return {
      status: 'unhealthy',
      responseTime,
      error: error instanceof Error ? error.message : 'Unknown database error'
    };
  }
}

async function checkRedisHealth(): Promise<{ status: 'healthy' | 'unhealthy'; responseTime?: number; error?: string }> {
  const startTime = Date.now();
  
  try {
    // Ensure Redis is connected
    await redis.connect();
    
    // Perform health check
    const isHealthy = await redis.healthCheck();
    const responseTime = Date.now() - startTime;
    
    if (isHealthy) {
      return {
        status: 'healthy',
        responseTime
      };
    } else {
      return {
        status: 'unhealthy',
        responseTime,
        error: 'Redis ping failed'
      };
    }
  } catch (error) {
    const responseTime = Date.now() - startTime;
    return {
      status: 'unhealthy',
      responseTime,
      error: error instanceof Error ? error.message : 'Unknown Redis error'
    };
  }
}

async function checkVectorHealth(): Promise<{ status: 'healthy' | 'unhealthy'; responseTime?: number; error?: string }> {
  const startTime = Date.now();
  
  try {
    // Perform vector database health check
    const healthResult = await vectorService.healthCheck();
    const responseTime = Date.now() - startTime;
    
    if (healthResult.status === 'healthy') {
      return {
        status: 'healthy',
        responseTime
      };
    } else {
      return {
        status: 'unhealthy',
        responseTime,
        error: healthResult.message
      };
    }
  } catch (error) {
    const responseTime = Date.now() - startTime;
    return {
      status: 'unhealthy',
      responseTime,
      error: error instanceof Error ? error.message : 'Unknown vector database error'
    };
  }
}

export async function GET(_request: NextRequest): Promise<NextResponse> {
  
  try {
    // Check all services in parallel
    const [databaseHealth, redisHealth, vectorHealth] = await Promise.all([
      checkDatabaseHealth(),
      checkRedisHealth(),
      checkVectorHealth()
    ]);
    
    // Determine overall status
    let overallStatus: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';
    
    const unhealthyServices = [];
    if (databaseHealth.status === 'unhealthy') unhealthyServices.push('database');
    if (redisHealth.status === 'unhealthy') unhealthyServices.push('redis');
    if (vectorHealth.status === 'unhealthy') unhealthyServices.push('vector');
    
    if (unhealthyServices.length >= 2) {
      overallStatus = 'unhealthy';
    } else if (unhealthyServices.length > 0) {
      overallStatus = 'degraded';
    }
    
    const healthStatus: HealthStatus = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      services: {
        database: databaseHealth,
        redis: redisHealth,
        vector: vectorHealth
      },
      uptime: process.uptime()
    };
    
    // Return appropriate HTTP status code
    const httpStatus = overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 207 : 503;
    
    return NextResponse.json(healthStatus, { status: httpStatus });
    
  } catch (_error) {
    // If there's an unexpected error, return unhealthy status
    const healthStatus: HealthStatus = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      services: {
        database: {
          status: 'unhealthy',
          error: 'Health check failed'
        },
        redis: {
          status: 'unhealthy',
          error: 'Health check failed'
        },
        vector: {
          status: 'unhealthy',
          error: 'Health check failed'
        }
      },
      uptime: process.uptime()
    };
    
    return NextResponse.json(healthStatus, { status: 503 });
  }
}

// Also support HEAD requests for simple health checks
export async function HEAD(_request: NextRequest): Promise<NextResponse> {
  try {
    // Quick health check without detailed response
    const [databaseHealthy, redisHealthy, vectorHealthy] = await Promise.all([
      database.healthCheck().catch(() => false),
      redis.healthCheck().catch(() => false),
      vectorService.healthCheck().then(result => result.status === 'healthy').catch(() => false)
    ]);
    
    // Return 200 if at least one service is healthy, 503 if all are down
    const status = (databaseHealthy || redisHealthy || vectorHealthy) ? 200 : 503;
    
    return new NextResponse(null, { status });
  } catch (_error) {
    return new NextResponse(null, { status: 503 });
  }
}