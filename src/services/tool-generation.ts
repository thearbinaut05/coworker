import { ToolGenerationRequest, GeneratedTool } from '../types/index';
import { CodeGenerationService } from './code-generation';
import { Logger } from '../utils/logger';

export class ToolGenerationService {
  private codeGenerationService: CodeGenerationService;
  private logger: Logger;

  constructor(codeGenerationService: CodeGenerationService) {
    this.codeGenerationService = codeGenerationService;
    this.logger = new Logger();
  }

  async generateTool(request: ToolGenerationRequest): Promise<GeneratedTool> {
    try {
      this.logger.info('Generating tool', { type: request.type, name: request.name });

      const toolCode = await this.generateToolCode(request);
      const documentation = await this.generateDocumentation(request, toolCode);
      const tests = await this.generateTests(request, toolCode);
      const packageJson = request.type === 'cli' || request.type === 'library' 
        ? await this.generatePackageJson(request) 
        : undefined;
      const setupInstructions = this.generateSetupInstructions(request);

      return {
        name: request.name,
        code: toolCode,
        documentation,
        tests,
        packageJson,
        setupInstructions
      };
    } catch (error) {
      this.logger.error('Tool generation failed', error);
      throw new Error('Tool generation failed');
    }
  }

  private async generateToolCode(request: ToolGenerationRequest): Promise<string> {
    const codeRequest = {
      language: request.targetLanguage,
      description: `Create a ${request.type} called "${request.name}" that ${request.description}`,
      requirements: [
        ...request.features,
        'Include proper error handling',
        'Add input validation',
        'Implement logging',
        'Follow best practices for the target language'
      ],
      context: `This is a ${request.type} tool that should be production-ready and well-structured.`
    };

    const response = await this.codeGenerationService.generateCode(codeRequest);
    return response.code;
  }

  private async generateDocumentation(request: ToolGenerationRequest, code: string): Promise<string> {
    const docRequest = {
      language: 'markdown',
      description: `Create comprehensive documentation for the ${request.type} "${request.name}"`,
      requirements: [
        'Installation instructions',
        'Usage examples',
        'API reference',
        'Configuration options',
        'Troubleshooting guide'
      ],
      context: `Tool description: ${request.description}\nFeatures: ${request.features.join(', ')}\n\nCode:\n${code}`
    };

    const response = await this.codeGenerationService.generateCode(docRequest);
    return response.code;
  }

  private async generateTests(request: ToolGenerationRequest, code: string): Promise<string> {
    const testFramework = this.getTestFramework(request.targetLanguage);
    
    const testRequest = {
      language: request.targetLanguage,
      framework: testFramework,
      description: `Create comprehensive unit tests for the ${request.type} "${request.name}"`,
      requirements: [
        'Test all main functions',
        'Test error cases',
        'Test edge cases',
        'Mock external dependencies',
        'Achieve high code coverage'
      ],
      context: `Original code:\n${code}`
    };

    const response = await this.codeGenerationService.generateCode(testRequest);
    return response.code;
  }

  private async generatePackageJson(request: ToolGenerationRequest): Promise<string> {
    const packageData = {
      name: request.name.toLowerCase().replace(/\s+/g, '-'),
      version: '1.0.0',
      description: request.description,
      main: request.type === 'cli' ? 'bin/cli.js' : 'dist/index.js',
      scripts: this.getScripts(request),
      keywords: this.extractKeywords(request),
      author: 'Coworker Generated',
      license: 'MIT',
      dependencies: this.getDependencies(request),
      devDependencies: this.getDevDependencies(request),
      ...(request.type === 'cli' && {
        bin: {
          [request.name.toLowerCase().replace(/\s+/g, '-')]: './bin/cli.js'
        }
      })
    };

    return JSON.stringify(packageData, null, 2);
  }

  private getTestFramework(language: string): string {
    const frameworks: { [key: string]: string } = {
      'javascript': 'jest',
      'typescript': 'jest',
      'python': 'pytest',
      'java': 'junit',
      'go': 'testing',
      'rust': 'cargo test',
      'csharp': 'nunit'
    };

    return frameworks[language.toLowerCase()] || 'jest';
  }

  private getScripts(request: ToolGenerationRequest): { [key: string]: string } {
    const baseScripts: { [key: string]: string } = {
      'test': 'jest',
      'build': 'tsc',
      'start': 'node dist/index.js'
    };

    if (request.type === 'cli') {
      baseScripts['install-global'] = 'npm install -g .';
      baseScripts['uninstall-global'] = 'npm uninstall -g .';
    }

    if (request.targetLanguage === 'typescript') {
      baseScripts['dev'] = 'ts-node src/index.ts';
      baseScripts['type-check'] = 'tsc --noEmit';
    }

    return baseScripts;
  }

  private extractKeywords(request: ToolGenerationRequest): string[] {
    const keywords = [
      request.type,
      request.targetLanguage,
      'automation',
      'tool',
      'coworker-generated'
    ];

    // Extract keywords from description and features
    const text = `${request.description} ${request.features.join(' ')}`.toLowerCase();
    const commonKeywords = ['api', 'cli', 'web', 'server', 'client', 'database', 'auth', 'testing'];
    
    commonKeywords.forEach(keyword => {
      if (text.includes(keyword) && !keywords.includes(keyword)) {
        keywords.push(keyword);
      }
    });

    return keywords;
  }

  private getDependencies(request: ToolGenerationRequest): { [key: string]: string } {
    const baseDeps: { [key: string]: string } = {};

    if (request.targetLanguage === 'javascript' || request.targetLanguage === 'typescript') {
      if (request.type === 'cli') {
        baseDeps['commander'] = '^9.0.0';
        baseDeps['chalk'] = '^5.0.0';
        baseDeps['inquirer'] = '^9.0.0';
      }

      if (request.features.some(f => f.toLowerCase().includes('api'))) {
        baseDeps['axios'] = '^1.0.0';
      }

      if (request.features.some(f => f.toLowerCase().includes('config'))) {
        baseDeps['dotenv'] = '^16.0.0';
      }

      baseDeps['winston'] = '^3.0.0'; // Always include logging
    }

    return baseDeps;
  }

  private getDevDependencies(request: ToolGenerationRequest): { [key: string]: string } {
    const devDeps: { [key: string]: string } = {};

    if (request.targetLanguage === 'typescript') {
      devDeps['typescript'] = '^5.0.0';
      devDeps['@types/node'] = '^20.0.0';
      devDeps['ts-node'] = '^10.0.0';
    }

    if (request.targetLanguage === 'javascript' || request.targetLanguage === 'typescript') {
      devDeps['jest'] = '^29.0.0';
      devDeps['@types/jest'] = '^29.0.0';
      devDeps['eslint'] = '^8.0.0';
      devDeps['prettier'] = '^3.0.0';
    }

    return devDeps;
  }

  private generateSetupInstructions(request: ToolGenerationRequest): string[] {
    const instructions: string[] = [];

    instructions.push('1. Install dependencies:');
    
    if (request.targetLanguage === 'javascript' || request.targetLanguage === 'typescript') {
      instructions.push('   npm install');
    } else if (request.targetLanguage === 'python') {
      instructions.push('   pip install -r requirements.txt');
    }

    if (request.targetLanguage === 'typescript') {
      instructions.push('2. Build the project:');
      instructions.push('   npm run build');
    }

    instructions.push('3. Run tests:');
    instructions.push('   npm test');

    if (request.type === 'cli') {
      instructions.push('4. Install globally (optional):');
      instructions.push('   npm install -g .');
      instructions.push('5. Run the CLI:');
      instructions.push(`   ${request.name.toLowerCase().replace(/\s+/g, '-')} --help`);
    } else {
      instructions.push('4. Start the application:');
      instructions.push('   npm start');
    }

    instructions.push('5. Development mode:');
    instructions.push('   npm run dev');

    return instructions;
  }

  async generateFrameworkScaffold(
    frameworkName: string, 
    projectName: string, 
    features: string[]
  ): Promise<{ files: { [filename: string]: string } }> {
    try {
      const files: { [filename: string]: string } = {};

      // Generate main application file
      const mainFile = await this.generateMainFile(frameworkName, projectName, features);
      files[this.getMainFileName(frameworkName)] = mainFile;

      // Generate configuration files
      const configFiles = await this.generateConfigFiles(frameworkName, features);
      Object.assign(files, configFiles);

      // Generate basic components/modules
      const componentFiles = await this.generateBasicComponents(frameworkName, features);
      Object.assign(files, componentFiles);

      // Generate package.json for the scaffold
      const packageJson = await this.generateScaffoldPackageJson(frameworkName, projectName, features);
      files['package.json'] = packageJson;

      return { files };
    } catch (error) {
      this.logger.error('Framework scaffold generation failed', error);
      throw new Error('Framework scaffold generation failed');
    }
  }

  private async generateMainFile(frameworkName: string, projectName: string, features: string[]): Promise<string> {
    const request = {
      language: this.getFrameworkLanguage(frameworkName),
      framework: frameworkName,
      description: `Create a main application file for a ${frameworkName} project named "${projectName}"`,
      requirements: [
        'Set up basic application structure',
        'Include necessary imports',
        'Configure middleware and routing',
        ...features.map(f => `Include ${f} functionality`)
      ]
    };

    const response = await this.codeGenerationService.generateCode(request);
    return response.code;
  }

  private getMainFileName(frameworkName: string): string {
    const fileNames: { [key: string]: string } = {
      'express': 'src/app.js',
      'nestjs': 'src/main.ts',
      'react': 'src/App.tsx',
      'vue': 'src/main.js',
      'angular': 'src/main.ts',
      'django': 'app.py',
      'flask': 'app.py',
      'spring': 'src/main/java/Application.java'
    };

    return fileNames[frameworkName.toLowerCase()] || 'src/index.js';
  }

  private getFrameworkLanguage(frameworkName: string): string {
    const languages: { [key: string]: string } = {
      'express': 'javascript',
      'nestjs': 'typescript',
      'react': 'typescript',
      'vue': 'javascript',
      'angular': 'typescript',
      'django': 'python',
      'flask': 'python',
      'spring': 'java'
    };

    return languages[frameworkName.toLowerCase()] || 'javascript';
  }

  private async generateConfigFiles(frameworkName: string, features: string[]): Promise<{ [filename: string]: string }> {
    const files: { [filename: string]: string } = {};

    // Generate framework-specific config files
    if (frameworkName.toLowerCase() === 'react' || frameworkName.toLowerCase() === 'vue') {
      files['vite.config.js'] = this.generateViteConfig();
    }

    if (features.includes('database')) {
      files['database.config.js'] = this.generateDatabaseConfig();
    }

    if (features.includes('authentication')) {
      files['auth.config.js'] = this.generateAuthConfig();
    }

    return files;
  }

  private async generateBasicComponents(frameworkName: string, features: string[]): Promise<{ [filename: string]: string }> {
    const files: { [filename: string]: string } = {};

    if (frameworkName.toLowerCase() === 'react') {
      files['src/components/Header.tsx'] = this.generateReactComponent('Header');
      files['src/components/Footer.tsx'] = this.generateReactComponent('Footer');
    }

    if (features.includes('api') && frameworkName.toLowerCase() === 'express') {
      files['src/routes/api.js'] = this.generateExpressRoute();
      files['src/middleware/auth.js'] = this.generateExpressMiddleware();
    }

    return files;
  }

  private async generateScaffoldPackageJson(frameworkName: string, projectName: string, features: string[]): Promise<string> {
    const packageData = {
      name: projectName.toLowerCase().replace(/\s+/g, '-'),
      version: '1.0.0',
      description: `A ${frameworkName} application generated by Coworker`,
      scripts: this.getFrameworkScripts(frameworkName),
      dependencies: this.getFrameworkDependencies(frameworkName, features),
      devDependencies: this.getFrameworkDevDependencies(frameworkName)
    };

    return JSON.stringify(packageData, null, 2);
  }

  private getFrameworkScripts(frameworkName: string): { [key: string]: string } {
    const scripts: { [key: string]: { [key: string]: string } } = {
      'react': {
        'dev': 'vite',
        'build': 'vite build',
        'preview': 'vite preview',
        'test': 'vitest'
      },
      'express': {
        'start': 'node src/app.js',
        'dev': 'nodemon src/app.js',
        'test': 'jest'
      },
      'nestjs': {
        'start': 'nest start',
        'dev': 'nest start --watch',
        'build': 'nest build',
        'test': 'jest'
      }
    };

    return scripts[frameworkName.toLowerCase()] || scripts['express'];
  }

  private getFrameworkDependencies(frameworkName: string, features: string[]): { [key: string]: string } {
    const baseDeps: { [key: string]: { [key: string]: string } } = {
      'react': {
        'react': '^18.0.0',
        'react-dom': '^18.0.0'
      },
      'express': {
        'express': '^4.18.0',
        'cors': '^2.8.5',
        'helmet': '^7.0.0'
      },
      'nestjs': {
        '@nestjs/core': '^10.0.0',
        '@nestjs/common': '^10.0.0',
        '@nestjs/platform-express': '^10.0.0'
      }
    };

    const deps = baseDeps[frameworkName.toLowerCase()] || {};

    // Add feature-specific dependencies
    if (features.includes('database')) {
      if (frameworkName.toLowerCase() === 'express') {
        deps['mongoose'] = '^7.0.0';
      }
    }

    if (features.includes('authentication')) {
      deps['jsonwebtoken'] = '^9.0.0';
      deps['bcryptjs'] = '^2.4.3';
    }

    return deps;
  }

  private getFrameworkDevDependencies(frameworkName: string): { [key: string]: string } {
    const devDeps: { [key: string]: { [key: string]: string } } = {
      'react': {
        '@vitejs/plugin-react': '^4.0.0',
        'vite': '^4.0.0',
        'vitest': '^0.34.0',
        '@types/react': '^18.0.0',
        '@types/react-dom': '^18.0.0'
      },
      'express': {
        'nodemon': '^3.0.0',
        'jest': '^29.0.0',
        'supertest': '^6.3.0'
      }
    };

    return devDeps[frameworkName.toLowerCase()] || {};
  }

  // Helper methods for generating specific file types
  private generateViteConfig(): string {
    return `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true
  }
})`;
  }

  private generateDatabaseConfig(): string {
    return `module.exports = {
  development: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 27017,
    database: process.env.DB_NAME || 'app_development'
  },
  production: {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME
  }
}`;
  }

  private generateAuthConfig(): string {
    return `module.exports = {
  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  },
  bcrypt: {
    rounds: 12
  }
}`;
  }

  private generateReactComponent(name: string): string {
    return `import React from 'react';

interface ${name}Props {}

const ${name}: React.FC<${name}Props> = () => {
  return (
    <div>
      <h1>${name} Component</h1>
    </div>
  );
};

export default ${name};`;
  }

  private generateExpressRoute(): string {
    return `const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.json({ message: 'API is working!' });
});

router.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

module.exports = router;`;
  }

  private generateExpressMiddleware(): string {
    return `const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(400).json({ error: 'Invalid token.' });
  }
};

module.exports = authMiddleware;`;
  }
}