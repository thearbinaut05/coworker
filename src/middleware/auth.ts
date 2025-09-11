import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../services/database';
import { Logger } from '../utils/logger';

interface AuthenticatedRequest extends Request {
  user?: any;
}

const logger = new Logger();

export const authMiddleware = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.header('Authorization');
    const apiKey = req.header('X-API-Key');

    if (apiKey) {
      // API Key authentication
      const user = await User.findOne({ apiKey });
      if (!user) {
        res.status(401).json({ error: 'Invalid API key' });
        return;
      }

      // Check usage limits
      const plan = getPlanById(user.planId);
      if (plan && plan.maxRequests !== -1 && user.usage && user.usage.requestsThisMonth >= plan.maxRequests) {
        res.status(429).json({ 
          error: 'Usage limit exceeded',
          limit: plan.maxRequests,
          used: user.usage?.requestsThisMonth || 0
        });
        return;
      }

      // Update usage
      await User.findByIdAndUpdate(user._id, {
        $inc: { 
          'usage.requestsThisMonth': 1,
          'usage.totalRequests': 1
        },
        $set: { 'usage.lastRequest': new Date() }
      });

      req.user = user;
      next();
      return;
    }

    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Access denied. No valid authentication provided.' });
      return;
    }

    const token = authHeader.replace('Bearer ', '');
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret') as any;
      const user = await User.findById(decoded.userId);
      
      if (!user) {
        res.status(401).json({ error: 'User not found' });
        return;
      }

      req.user = user;
      next();
    } catch (jwtError) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
  } catch (error) {
    logger.error('Authentication middleware error', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

export const rateLimitMiddleware = (windowMs: number, maxRequests: number) => {
  const requests = new Map<string, { count: number; resetTime: number }>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const clientId = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();

    const clientData = requests.get(clientId);
    
    if (!clientData || now > clientData.resetTime) {
      requests.set(clientId, { count: 1, resetTime: now + windowMs });
      next();
      return;
    }

    if (clientData.count >= maxRequests) {
      res.status(429).json({
        error: 'Too many requests',
        resetTime: new Date(clientData.resetTime).toISOString()
      });
      return;
    }

    clientData.count++;
    next();
  };
};

export const validateRequest = (schema: any) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error } = schema.validate(req.body);
    
    if (error) {
      res.status(400).json({
        error: 'Validation failed',
        details: error.details.map((detail: any) => detail.message)
      });
      return;
    }
    
    next();
  };
};

export const corsMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  res.header('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-API-Key');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  
  next();
};

export const errorHandler = (error: any, req: Request, res: Response, next: NextFunction): void => {
  logger.error('Unhandled error', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    body: req.body,
    params: req.params,
    query: req.query
  });

  if (error.name === 'ValidationError') {
    res.status(400).json({
      error: 'Validation Error',
      details: Object.values(error.errors).map((err: any) => err.message)
    });
    return;
  }

  if (error.name === 'CastError') {
    res.status(400).json({
      error: 'Invalid ID format'
    });
    return;
  }

  if (error.code === 11000) {
    res.status(409).json({
      error: 'Duplicate key error',
      field: Object.keys(error.keyPattern)[0]
    });
    return;
  }

  const status = error.status || error.statusCode || 500;
  const message = status === 500 
    ? 'Internal server error' 
    : error.message || 'Something went wrong';

  res.status(status).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
};

export const analyticsMiddleware = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  // Log analytics data asynchronously
  setImmediate(async () => {
    try {
      const { Analytics } = await import('@services/database');
      
      await Analytics.create({
        userId: req.user?._id,
        event: `${req.method} ${req.path}`,
        data: {
          query: req.query,
          params: req.params,
          body: Object.keys(req.body || {}).length > 0 ? { hasBody: true } : undefined
        },
        userAgent: req.get('User-Agent'),
        ip: req.ip
      });
    } catch (error) {
      logger.error('Analytics logging failed', error);
    }
  });

  next();
};

// Helper function to get plan by ID
function getPlanById(planId: string) {
  const plans = [
    { id: 'basic', maxRequests: 1000 },
    { id: 'pro', maxRequests: 10000 },
    { id: 'enterprise', maxRequests: -1 }
  ];
  
  return plans.find(p => p.id === planId);
}