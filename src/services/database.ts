import mongoose from 'mongoose';
import { Logger } from '../utils/logger';

export class DatabaseService {
  private logger: Logger;
  private config: { url: string; options?: any };

  constructor(config: { url: string; options?: any }) {
    this.config = config;
    this.logger = new Logger();
  }

  async connect(): Promise<void> {
    try {
      await mongoose.connect(this.config.url, {
        ...this.config.options,
      });
      this.logger.info('Connected to MongoDB');
    } catch (error) {
      this.logger.error('MongoDB connection failed', error);
      throw new Error('Database connection failed');
    }
  }

  async disconnect(): Promise<void> {
    try {
      await mongoose.disconnect();
      this.logger.info('Disconnected from MongoDB');
    } catch (error) {
      this.logger.error('MongoDB disconnection failed', error);
    }
  }

  isConnected(): boolean {
    return mongoose.connection.readyState === 1;
  }
}

// User Schema
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  password: { type: String, required: true },
  planId: { type: String, required: true, default: 'basic' },
  apiKey: { type: String, required: true, unique: true },
  stripeCustomerId: { type: String },
  subscriptionId: { type: String },
  usage: {
    requestsThisMonth: { type: Number, default: 0 },
    totalRequests: { type: Number, default: 0 },
    lastRequest: { type: Date, default: Date.now },
    resetDate: { type: Date, default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }
  },
  settings: {
    preferredLanguage: { type: String, default: 'typescript' },
    notifications: { type: Boolean, default: true },
    theme: { type: String, default: 'dark' }
  }
}, {
  timestamps: true
});

export const User = mongoose.model('User', userSchema);

// Project Schema
const projectSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  technologies: [{ type: String }],
  framework: { type: String },
  repository: {
    url: { type: String },
    branch: { type: String, default: 'main' },
    lastSync: { type: Date }
  },
  settings: {
    autoSync: { type: Boolean, default: false },
    aiAssistanceLevel: { type: String, enum: ['basic', 'advanced', 'autonomous'], default: 'advanced' }
  },
  stats: {
    codeGenerations: { type: Number, default: 0 },
    toolsGenerated: { type: Number, default: 0 },
    researchQueries: { type: Number, default: 0 }
  }
}, {
  timestamps: true
});

export const Project = mongoose.model('Project', projectSchema);

// Generated Tool Schema
const generatedToolSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, enum: ['cli', 'library', 'framework', 'script'], required: true },
  description: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
  language: { type: String, required: true },
  code: { type: String, required: true },
  documentation: { type: String },
  tests: { type: String },
  packageJson: { type: String },
  setupInstructions: [{ type: String }],
  features: [{ type: String }],
  version: { type: String, default: '1.0.0' },
  downloads: { type: Number, default: 0 },
  ratings: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rating: { type: Number, min: 1, max: 5 },
    comment: { type: String },
    createdAt: { type: Date, default: Date.now }
  }],
  isPublic: { type: Boolean, default: false }
}, {
  timestamps: true
});

export const GeneratedTool = mongoose.model('GeneratedTool', generatedToolSchema);

// Research Query Schema
const researchQuerySchema = new mongoose.Schema({
  query: { type: String, required: true },
  technology: { type: String, required: true },
  purpose: { type: String },
  constraints: [{ type: String }],
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
  results: {
    summary: { type: String },
    recommendations: [{ type: String }],
    resources: [{
      title: { type: String },
      url: { type: String },
      type: { type: String, enum: ['documentation', 'tutorial', 'repository', 'article'] },
      relevance: { type: Number }
    }],
    codeExamples: [{
      language: { type: String },
      code: { type: String },
      description: { type: String },
      source: { type: String }
    }]
  },
  processingTime: { type: Number }, // in milliseconds
  status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' }
}, {
  timestamps: true
});

export const ResearchQuery = mongoose.model('ResearchQuery', researchQuerySchema);

// Code Generation Request Schema
const codeGenerationSchema = new mongoose.Schema({
  language: { type: String, required: true },
  framework: { type: String },
  description: { type: String, required: true },
  requirements: [{ type: String }],
  context: { type: String },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
  response: {
    code: { type: String },
    explanation: { type: String },
    dependencies: [{ type: String }],
    tests: { type: String },
    documentation: { type: String }
  },
  qualityScore: { type: Number, min: 0, max: 100 },
  processingTime: { type: Number },
  status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
  feedback: {
    helpful: { type: Boolean },
    rating: { type: Number, min: 1, max: 5 },
    comments: { type: String }
  }
}, {
  timestamps: true
});

export const CodeGeneration = mongoose.model('CodeGeneration', codeGenerationSchema);

// Analytics Schema
const analyticsSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  event: { type: String, required: true },
  data: { type: mongoose.Schema.Types.Mixed },
  sessionId: { type: String },
  userAgent: { type: String },
  ip: { type: String },
  timestamp: { type: Date, default: Date.now }
});

export const Analytics = mongoose.model('Analytics', analyticsSchema);