import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { CoworkerConfig } from '../types/index';
import { Logger } from '../utils/logger';
import { CodeGenerationService } from '../services/code-generation';
import { PaymentService } from '../services/payment';
import { ResearchService } from '../services/research';
import { ToolGenerationService } from '../services/tool-generation';
import { DatabaseService } from '../services/database';
import { authMiddleware } from '../middleware/auth';
import codeRoutes from '../routes/code';
import paymentRoutes from '../routes/payment';
import researchRoutes from '../routes/research';
import toolRoutes from '../routes/tools';

export class CoworkerApp {
  private app: express.Application;
  private server: any;
  private io: SocketIOServer;
  private config: CoworkerConfig;
  private logger: Logger;
  
  // Services
  private codeGenerationService!: CodeGenerationService;
  private paymentService!: PaymentService;
  private researchService!: ResearchService;
  private toolGenerationService!: ToolGenerationService;
  private databaseService!: DatabaseService;

  constructor(config: CoworkerConfig) {
    this.config = config;
    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });
    this.logger = new Logger();
    
    this.initializeServices();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupSocketIO();
  }

  private initializeServices(): void {
    this.databaseService = new DatabaseService(this.config.database);
    this.codeGenerationService = new CodeGenerationService(this.config.ai);
    this.paymentService = new PaymentService(this.config.payment);
    this.researchService = new ResearchService(this.config.github);
    this.toolGenerationService = new ToolGenerationService(this.codeGenerationService);
  }

  private setupMiddleware(): void {
    this.app.use(helmet());
    this.app.use(cors());
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));
    
    // Logging middleware
    this.app.use((req, res, next) => {
      this.logger.info(`${req.method} ${req.path}`, { ip: req.ip });
      next();
    });
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'healthy', timestamp: new Date().toISOString() });
    });

    // API routes
    this.app.use('/api/code', authMiddleware, codeRoutes(this.codeGenerationService));
    this.app.use('/api/payment', paymentRoutes(this.paymentService));
    this.app.use('/api/research', authMiddleware, researchRoutes(this.researchService));
    this.app.use('/api/tools', authMiddleware, toolRoutes(this.toolGenerationService));

    // Error handling middleware
    this.app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      this.logger.error('Application error', error);
      res.status(500).json({ 
        error: 'Internal server error',
        message: this.config.environment === 'development' ? error.message : 'Something went wrong'
      });
    });
  }

  private setupSocketIO(): void {
    this.io.on('connection', (socket) => {
      this.logger.info('Client connected', { socketId: socket.id });

      socket.on('generate-code', async (data) => {
        try {
          const result = await this.codeGenerationService.generateCode(data);
          socket.emit('code-generated', result);
        } catch (error) {
          socket.emit('error', { message: 'Code generation failed' });
        }
      });

      socket.on('research-topic', async (data) => {
        try {
          const result = await this.researchService.researchTopic(data);
          socket.emit('research-complete', result);
        } catch (error) {
          socket.emit('error', { message: 'Research failed' });
        }
      });

      socket.on('disconnect', () => {
        this.logger.info('Client disconnected', { socketId: socket.id });
      });
    });
  }

  public async start(): Promise<void> {
    try {
      await this.databaseService.connect();
      
      this.server.listen(this.config.port, () => {
        this.logger.info(`Coworker app listening on port ${this.config.port}`);
      });
    } catch (error) {
      this.logger.error('Failed to start application', error);
      process.exit(1);
    }
  }

  public async stop(): Promise<void> {
    try {
      await this.databaseService.disconnect();
      this.server.close();
      this.logger.info('Application stopped');
    } catch (error) {
      this.logger.error('Error stopping application', error);
    }
  }
}