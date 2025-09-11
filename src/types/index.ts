// Core interfaces and types for the Coworker application

export interface CoworkerConfig {
  port: number;
  environment: 'development' | 'production' | 'test';
  database: {
    url: string;
    options?: any;
  };
  redis: {
    url: string;
    options?: any;
  };
  ai: {
    openaiApiKey: string;
    model: string;
  };
  payment: {
    stripe: {
      secretKey: string;
      publishableKey: string;
    };
    paypal: {
      clientId: string;
      clientSecret: string;
    };
  };
  github: {
    token: string;
  };
}

export interface CodeGenerationRequest {
  language: string;
  framework?: string;
  description: string;
  requirements: string[];
  context?: string;
}

export interface CodeGenerationResponse {
  code: string;
  explanation: string;
  dependencies: string[];
  tests?: string;
  documentation?: string;
}

export interface ResearchQuery {
  technology: string;
  purpose: string;
  constraints?: string[];
}

export interface ResearchResult {
  summary: string;
  recommendations: string[];
  codeExamples: CodeExample[];
  resources: Resource[];
}

export interface CodeExample {
  language: string;
  code: string;
  description: string;
  source: string;
}

export interface Resource {
  title: string;
  url: string;
  type: 'documentation' | 'tutorial' | 'repository' | 'article';
  relevance: number;
}

export interface PaymentPlan {
  id: string;
  name: string;
  price: number;
  currency: string;
  interval: 'month' | 'year';
  features: string[];
  maxRequests: number;
}

export interface User {
  id: string;
  email: string;
  name: string;
  plan: PaymentPlan;
  apiKey: string;
  usage: UserUsage;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserUsage {
  requestsThisMonth: number;
  totalRequests: number;
  lastRequest: Date;
}

export interface ToolGenerationRequest {
  type: 'cli' | 'library' | 'framework' | 'script';
  name: string;
  description: string;
  features: string[];
  targetLanguage: string;
}

export interface GeneratedTool {
  name: string;
  code: string;
  documentation: string;
  tests: string;
  packageJson?: string;
  setupInstructions: string[];
}