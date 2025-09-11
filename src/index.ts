import dotenv from 'dotenv';
import { CoworkerApp } from './core/app';
import { CoworkerConfig } from './types/index';
import { Logger } from './utils/logger';

// Load environment variables
dotenv.config();

const logger = new Logger();

// Configuration
const config: CoworkerConfig = {
  port: parseInt(process.env.PORT || '3000'),
  environment: (process.env.NODE_ENV as 'development' | 'production' | 'test') || 'development',
  database: {
    url: process.env.MONGODB_URL || 'mongodb://localhost:27017/coworker',
    options: {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    }
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  ai: {
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4',
  },
  payment: {
    stripe: {
      secretKey: process.env.STRIPE_SECRET_KEY || '',
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
    },
    paypal: {
      clientId: process.env.PAYPAL_CLIENT_ID || '',
      clientSecret: process.env.PAYPAL_CLIENT_SECRET || '',
    }
  },
  github: {
    token: process.env.GITHUB_TOKEN || '',
  }
};

// Validate required environment variables
const requiredEnvVars = [
  'OPENAI_API_KEY',
  'MONGODB_URL',
  'STRIPE_SECRET_KEY',
  'GITHUB_TOKEN'
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0 && config.environment === 'production') {
  logger.error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
  process.exit(1);
}

// Create and start the application
async function startApplication() {
  try {
    const app = new CoworkerApp(config);
    await app.start();

    logger.info('🚀 Coworker application started successfully', {
      port: config.port,
      environment: config.environment,
      features: [
        'AI Code Generation',
        'Payment Processing',
        'Research Capabilities',
        'Tool Generation',
        'Multi-language Support'
      ]
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      await app.stop();
      process.exit(0);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start application', error);
    process.exit(1);
  }
}

// Handle uncaught exceptions and rejections
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', { promise, reason });
  process.exit(1);
});

// Start the application
startApplication();