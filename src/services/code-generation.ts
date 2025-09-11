import { OpenAI } from 'openai';
import { CodeGenerationRequest, CodeGenerationResponse } from '../types/index';
import { Logger } from '../utils/logger';

export class CodeGenerationService {
  private openai: OpenAI;
  private logger: Logger;

  constructor(config: { openaiApiKey: string; model: string }) {
    this.openai = new OpenAI({
      apiKey: config.openaiApiKey,
    });
    this.logger = new Logger();
  }

  async generateCode(request: CodeGenerationRequest): Promise<CodeGenerationResponse> {
    try {
      const prompt = this.buildPrompt(request);
      
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `You are an expert software developer with deep knowledge of all programming languages and frameworks. 
            You generate high-quality, production-ready code with proper error handling, documentation, and tests.
            Always include explanations and best practices in your responses.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 4000,
      });

      const response = completion.choices[0].message.content;
      return this.parseResponse(response || '', request.language);
    } catch (error) {
      this.logger.error('Code generation failed', error);
      throw new Error('Failed to generate code');
    }
  }

  private buildPrompt(request: CodeGenerationRequest): string {
    return `
Generate ${request.language} code for the following requirements:

Description: ${request.description}
Framework: ${request.framework || 'None specified'}
Requirements:
${request.requirements.map(req => `- ${req}`).join('\n')}

${request.context ? `Additional context: ${request.context}` : ''}

Please provide:
1. Complete, working code
2. Detailed explanation of the implementation
3. List of required dependencies
4. Unit tests for the code
5. Brief documentation/comments

Format your response as:
CODE:
[your code here]

EXPLANATION:
[detailed explanation]

DEPENDENCIES:
[list of dependencies]

TESTS:
[unit tests]

DOCUMENTATION:
[documentation/comments]
    `;
  }

  private parseResponse(response: string, language: string): CodeGenerationResponse {
    const sections = {
      code: this.extractSection(response, 'CODE'),
      explanation: this.extractSection(response, 'EXPLANATION'),
      dependencies: this.extractSection(response, 'DEPENDENCIES').split('\n').filter(dep => dep.trim()),
      tests: this.extractSection(response, 'TESTS'),
      documentation: this.extractSection(response, 'DOCUMENTATION'),
    };

    return sections;
  }

  private extractSection(text: string, sectionName: string): string {
    const regex = new RegExp(`${sectionName}:\\s*([\\s\\S]*?)(?=${this.getSectionNames().join('|')}|$)`, 'i');
    const match = text.match(regex);
    return match ? match[1].trim() : '';
  }

  private getSectionNames(): string[] {
    return ['CODE', 'EXPLANATION', 'DEPENDENCIES', 'TESTS', 'DOCUMENTATION'];
  }

  async optimizeCode(code: string, language: string): Promise<string> {
    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a code optimization expert. Improve the given code for performance, readability, and best practices while maintaining functionality.'
          },
          {
            role: 'user',
            content: `Optimize this ${language} code:\n\n${code}`
          }
        ],
        temperature: 0.2,
        max_tokens: 3000,
      });

      return completion.choices[0].message.content || code;
    } catch (error) {
      this.logger.error('Code optimization failed', error);
      return code;
    }
  }

  async analyzeCodeQuality(code: string, language: string): Promise<{ score: number; suggestions: string[] }> {
    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a code quality analyst. Analyze code and provide a quality score (0-100) and improvement suggestions.'
          },
          {
            role: 'user',
            content: `Analyze this ${language} code quality:\n\n${code}\n\nProvide a score (0-100) and specific suggestions for improvement.`
          }
        ],
        temperature: 0.1,
        max_tokens: 2000,
      });

      const response = completion.choices[0].message.content || '';
      const scoreMatch = response.match(/(?:score|rating):\s*(\d+)/i);
      const score = scoreMatch ? parseInt(scoreMatch[1]) : 75;
      
      const suggestions = response
        .split('\n')
        .filter(line => line.trim().startsWith('-') || line.trim().startsWith('•'))
        .map(line => line.replace(/^[-•]\s*/, '').trim())
        .filter(suggestion => suggestion.length > 0);

      return { score, suggestions };
    } catch (error) {
      this.logger.error('Code quality analysis failed', error);
      return { score: 75, suggestions: ['Unable to analyze code quality'] };
    }
  }
}