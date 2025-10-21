import { createClient, RedisClientOptions } from 'redis';
import { z } from 'zod';

// Environment variable validation schema
const RedisConfigSchema = z.object({
  REDIS_HOST: z.string().min(1, 'REDIS_HOST is required'),
  REDIS_PORT: z.string().transform((val) => parseInt(val, 10)).pipe(z.number().min(1).max(65535)),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_URL: z.string().url().optional(),
});

type RedisConfig = z.infer<typeof RedisConfigSchema>;

interface CacheOptions {
  ttl?: number; // Time to live in seconds
}

class RedisConnection {
  private static instance: RedisConnection;
  private client: any = null;
  private config: RedisConfig;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 1000; // Start with 1 second

  private constructor() {
    // Validate environment variables
    const envConfig = {
      REDIS_HOST: process.env.REDIS_HOST,
      REDIS_PORT: process.env.REDIS_PORT,
      REDIS_PASSWORD: process.env.REDIS_PASSWORD,
      REDIS_URL: process.env.REDIS_URL,
    };

    try {
      this.config = RedisConfigSchema.parse(envConfig);
    } catch (error) {
      console.error('Redis configuration validation failed:', error);
      throw new Error('Invalid Redis configuration. Please check your environment variables.');
    }
  }

  public static getInstance(): RedisConnection {
    if (!RedisConnection.instance) {
      RedisConnection.instance = new RedisConnection();
    }
    return RedisConnection.instance;
  }

  public async connect(): Promise<any> {
    if (this.client && this.isConnected) {
      return this.client;
    }

    const clientOptions: RedisClientOptions = {
      socket: {
        host: this.config.REDIS_HOST,
        port: this.config.REDIS_PORT,
        reconnectStrategy: (retries) => {
          if (retries >= this.maxReconnectAttempts) {
            console.error(`Redis reconnection failed after ${retries} attempts`);
            return false;
          }
          
          const delay = Math.min(this.reconnectDelay * Math.pow(2, retries), 30000);
          console.log(`Redis reconnecting in ${delay}ms (attempt ${retries + 1})`);
          return delay;
        },
      },
    };

    // Use REDIS_URL if provided, otherwise use individual config values
    if (this.config.REDIS_URL) {
      clientOptions.url = this.config.REDIS_URL;
    } else if (this.config.REDIS_PASSWORD) {
      clientOptions.password = this.config.REDIS_PASSWORD;
    }

    this.client = createClient(clientOptions);

    // Set up event handlers
    this.client.on('error', (err: Error) => {
      console.error('Redis client error:', err);
      this.isConnected = false;
    });

    this.client.on('connect', () => {
      console.log('Redis client connected');
      this.isConnected = true;
      this.reconnectAttempts = 0;
    });

    this.client.on('ready', () => {
      console.log('Redis client ready');
      this.isConnected = true;
    });

    this.client.on('end', () => {
      console.log('Redis client disconnected');
      this.isConnected = false;
    });

    this.client.on('reconnecting', () => {
      console.log('Redis client reconnecting...');
      this.reconnectAttempts++;
    });

    try {
      await this.client.connect();
      console.log('Redis connection established successfully');
    } catch (error) {
      console.error('Failed to connect to Redis:', error);
      throw error;
    }

    return this.client;
  }

  public async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.isConnected = false;
      console.log('Redis connection closed');
    }
  }

  public getClient(): any {
    return this.client;
  }

  public isClientConnected(): boolean {
    return this.isConnected && this.client !== null;
  }

  // Caching methods
  public async set(key: string, value: any, options?: CacheOptions): Promise<void> {
    if (!this.client || !this.isConnected) {
      console.warn('Redis not connected, skipping cache set operation');
      return;
    }

    try {
      const serializedValue = JSON.stringify(value);
      
      if (options?.ttl) {
        await this.client.setEx(key, options.ttl, serializedValue);
      } else {
        await this.client.set(key, serializedValue);
      }
    } catch (error) {
      console.error('Redis set error:', error);
      // Don't throw error to prevent cache failures from breaking the application
    }
  }

  public async get<T = any>(key: string): Promise<T | null> {
    if (!this.client || !this.isConnected) {
      console.warn('Redis not connected, skipping cache get operation');
      return null;
    }

    try {
      const value = await this.client.get(key);
      
      if (value === null) {
        return null;
      }
      
      return JSON.parse(value) as T;
    } catch (error) {
      console.error('Redis get error:', error);
      return null;
    }
  }

  public async del(key: string): Promise<void> {
    if (!this.client || !this.isConnected) {
      console.warn('Redis not connected, skipping cache delete operation');
      return;
    }

    try {
      await this.client.del(key);
    } catch (error) {
      console.error('Redis delete error:', error);
    }
  }

  public async exists(key: string): Promise<boolean> {
    if (!this.client || !this.isConnected) {
      return false;
    }

    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      console.error('Redis exists error:', error);
      return false;
    }
  }

  public async expire(key: string, seconds: number): Promise<void> {
    if (!this.client || !this.isConnected) {
      console.warn('Redis not connected, skipping expire operation');
      return;
    }

    try {
      await this.client.expire(key, seconds);
    } catch (error) {
      console.error('Redis expire error:', error);
    }
  }

  // Session management methods
  public async setSession(sessionId: string, sessionData: any, ttl: number = 3600): Promise<void> {
    const key = `session:${sessionId}`;
    await this.set(key, sessionData, { ttl });
  }

  public async getSession<T = any>(sessionId: string): Promise<T | null> {
    const key = `session:${sessionId}`;
    return await this.get<T>(key);
  }

  public async deleteSession(sessionId: string): Promise<void> {
    const key = `session:${sessionId}`;
    await this.del(key);
  }

  public async extendSession(sessionId: string, ttl: number = 3600): Promise<void> {
    const key = `session:${sessionId}`;
    await this.expire(key, ttl);
  }

  public async healthCheck(): Promise<boolean> {
    try {
      if (!this.client || !this.isConnected) {
        return false;
      }
      
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      console.error('Redis health check failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const redis = RedisConnection.getInstance();

// Export types for use in other modules
export type { RedisConfig, CacheOptions };
export { RedisConfigSchema };