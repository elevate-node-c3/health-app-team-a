export type NodeEnv = 'dev' | 'prod' | 'test';

export interface AiConfig {
  apiKey?: string;
  baseUrl: string;
  model: string;
  inputCostPerMillion?: number;
  outputCostPerMillion?: number;
}

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

export interface MailConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
}

export interface StripeConfig {
  secretKey: string;
  publishableKey: string;
  webhookSecret: string;
}

export interface RabbitMqConfig {
  url: string;
  /** The single topic exchange every published event routes through. */
  exchange: string;
}

export interface RootConfig {
  ai: AiConfig;
  app: AppConfig;
  database: DatabaseConfig;
  redis: RedisConfig;
  mail: MailConfig;
  stripe: StripeConfig;
  rabbitmq: RabbitMqConfig;

  [key: string]: unknown;
}

export default (): RootConfig => {
  const nodeEnv = process.env.NODE_ENV;

  return {
    ai: {
      apiKey: process.env.AI_API_KEY,
      baseUrl: process.env.AI_BASE_URL ?? 'https://api.openai.com/v1',
      model: process.env.AI_MODEL ?? 'gpt-4o-mini',
      inputCostPerMillion:
        process.env.AI_INPUT_COST_PER_MILLION === undefined
          ? undefined
          : Number(process.env.AI_INPUT_COST_PER_MILLION),
      outputCostPerMillion:
        process.env.AI_OUTPUT_COST_PER_MILLION === undefined
          ? undefined
          : Number(process.env.AI_OUTPUT_COST_PER_MILLION),
    },
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
    mail: {
      host: process.env.SMTP_HOST ?? 'localhost',
      port: Number(process.env.SMTP_PORT ?? 1025),
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER,
      password: process.env.SMTP_PASSWORD,
      from: process.env.MAIL_FROM ?? 'no-reply@health-app.local',
    },
    stripe: {
      secretKey: process.env.STRIPE_SECRET_KEY!,
      publishableKey: process.env.PUBLISHABLE_KEY!,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
    },
    rabbitmq: {
      url: process.env.RABBITMQ_URL ?? 'amqp://localhost:5672',
      exchange: process.env.RABBITMQ_EXCHANGE ?? 'health.events',
    },
  };
};
