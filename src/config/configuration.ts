export type NodeEnv = 'dev' | 'prod' | 'test';

export interface AppConfig {
  nodeEnv: NodeEnv;
  port: number;
}

export interface DatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  name: string;
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  ttl: number;
}

export interface RootConfig {
  app: AppConfig;
  database: DatabaseConfig;
  redis: RedisConfig;

  [key: string]: unknown;
}

export default (): RootConfig => {
  const nodeEnv = process.env.NODE_ENV;

  return {
    app: {
      nodeEnv:
        nodeEnv === 'prod' || nodeEnv === 'test' || nodeEnv === 'dev'
          ? nodeEnv
          : 'dev',
      port: Number(process.env.PORT ?? 3000),
    },
    database: {
      host: process.env.DB_HOST ?? 'localhost',
      port: Number(process.env.DB_PORT ?? 5432),
      username: process.env.DB_USERNAME ?? 'postgres',
      password: process.env.DB_PASSWORD ?? 'postgres',
      name: process.env.DB_NAME ?? 'health_app',
    },
    redis: {
      host: process.env.REDIS_HOST ?? 'localhost',
      port: Number(process.env.REDIS_PORT ?? 6379),
      password: process.env.REDIS_PASSWORD,
      ttl: Number(process.env.REDIS_TTL ?? 60000),
    },
  };
};
