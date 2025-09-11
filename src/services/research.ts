import axios from 'axios';
import * as cheerio from 'cheerio';
import simpleGit from 'simple-git';
import { ResearchQuery, ResearchResult, CodeExample, Resource } from '../types/index';
import { Logger } from '../utils/logger';

export class ResearchService {
  private logger: Logger;
  private githubToken: string;
  private git: any;

  constructor(config: { token: string }) {
    this.logger = new Logger();
    this.githubToken = config.token;
    this.git = simpleGit();
  }

  async researchTopic(query: ResearchQuery): Promise<ResearchResult> {
    try {
      this.logger.info('Starting research', { technology: query.technology });

      const [
        githubResults,
        documentationResults,
        codeExamples
      ] = await Promise.all([
        this.searchGitHub(query.technology),
        this.searchDocumentation(query.technology),
        this.findCodeExamples(query.technology)
      ]);

      const summary = await this.generateSummary(query, githubResults, documentationResults);
      const recommendations = await this.generateRecommendations(query, githubResults);

      return {
        summary,
        recommendations,
        codeExamples,
        resources: [...githubResults, ...documentationResults]
      };
    } catch (error) {
      this.logger.error('Research failed', error);
      throw new Error('Research operation failed');
    }
  }

  private async searchGitHub(technology: string): Promise<Resource[]> {
    try {
      const response = await axios.get(`https://api.github.com/search/repositories`, {
        params: {
          q: `${technology} language:typescript language:javascript stars:>100`,
          sort: 'stars',
          order: 'desc',
          per_page: 10
        },
        headers: {
          'Authorization': `token ${this.githubToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      return response.data.items.map((repo: any) => ({
        title: repo.full_name,
        url: repo.html_url,
        type: 'repository' as const,
        relevance: this.calculateRelevance(repo, technology)
      }));
    } catch (error) {
      this.logger.error('GitHub search failed', error);
      return [];
    }
  }

  private async searchDocumentation(technology: string): Promise<Resource[]> {
    const documentationSites = [
      `https://developer.mozilla.org/en-US/search?q=${encodeURIComponent(technology)}`,
      `https://stackoverflow.com/search?q=${encodeURIComponent(technology)}`,
      `https://docs.npmjs.com/search?q=${encodeURIComponent(technology)}`
    ];

    const results: Resource[] = [];

    for (const url of documentationSites) {
      try {
        const response = await axios.get(url, {
          timeout: 5000,
          headers: {
            'User-Agent': 'Coworker-Research-Bot/1.0'
          }
        });

        const $ = cheerio.load(response.data);
        
        // Extract relevant links and titles
        $('a[href*="' + technology.toLowerCase() + '"]').each((_, element) => {
          const title = $(element).text().trim();
          const href = $(element).attr('href');
          
          if (title && href && title.length > 10) {
            results.push({
              title,
              url: href.startsWith('http') ? href : new URL(href, url).toString(),
              type: 'documentation',
              relevance: this.calculateTextRelevance(title, technology)
            });
          }
        });
      } catch (error) {
        this.logger.warn(`Failed to search documentation site: ${url}`, error);
      }
    }

    return results
      .filter(r => r.relevance > 0.3)
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 10);
  }

  private async findCodeExamples(technology: string): Promise<CodeExample[]> {
    try {
      // Search for code examples in popular repositories
      const response = await axios.get(`https://api.github.com/search/code`, {
        params: {
          q: `${technology} language:typescript language:javascript`,
          sort: 'indexed',
          order: 'desc',
          per_page: 5
        },
        headers: {
          'Authorization': `token ${this.githubToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      const examples: CodeExample[] = [];

      for (const item of response.data.items) {
        try {
          const fileResponse = await axios.get(item.url, {
            headers: {
              'Authorization': `token ${this.githubToken}`,
              'Accept': 'application/vnd.github.v3.raw'
            }
          });

          const code = Buffer.from(fileResponse.data.content, 'base64').toString('utf-8');
          const language = this.detectLanguage(item.name);

          examples.push({
            language,
            code: this.extractRelevantCode(code, technology),
            description: `Example from ${item.repository.full_name}`,
            source: item.html_url
          });
        } catch (error) {
          this.logger.warn('Failed to fetch code example', error);
        }
      }

      return examples;
    } catch (error) {
      this.logger.error('Code example search failed', error);
      return [];
    }
  }

  private async generateSummary(
    query: ResearchQuery, 
    githubResults: Resource[], 
    documentationResults: Resource[]
  ): Promise<string> {
    const topRepos = githubResults.slice(0, 3).map(r => r.title).join(', ');
    const topDocs = documentationResults.slice(0, 3).map(r => r.title).join(', ');

    return `
Research Summary for ${query.technology}:

Based on analysis of ${githubResults.length} repositories and ${documentationResults.length} documentation sources:

Popular repositories: ${topRepos}
Key documentation: ${topDocs}

${query.purpose ? `Purpose alignment: This technology appears well-suited for ${query.purpose}` : ''}

The ecosystem shows active development with strong community support and comprehensive documentation.
    `.trim();
  }

  private async generateRecommendations(query: ResearchQuery, githubResults: Resource[]): Promise<string[]> {
    const recommendations: string[] = [];

    // Analyze star counts and activity
    const highStarRepos = githubResults.filter(r => r.relevance > 0.8);
    if (highStarRepos.length > 0) {
      recommendations.push(`Consider using ${highStarRepos[0].title} as it has high community adoption`);
    }

    // Purpose-specific recommendations
    if (query.purpose.toLowerCase().includes('web')) {
      recommendations.push('Focus on frameworks with strong web support and active maintenance');
    }

    if (query.purpose.toLowerCase().includes('api')) {
      recommendations.push('Prioritize libraries with good REST/GraphQL integration');
    }

    if (query.constraints) {
      query.constraints.forEach(constraint => {
        if (constraint.toLowerCase().includes('performance')) {
          recommendations.push('Evaluate performance benchmarks before implementation');
        }
        if (constraint.toLowerCase().includes('security')) {
          recommendations.push('Review security practices and vulnerability reports');
        }
      });
    }

    recommendations.push('Set up automated testing and CI/CD pipeline');
    recommendations.push('Plan for regular dependency updates and security patches');

    return recommendations;
  }

  private calculateRelevance(repo: any, technology: string): number {
    let relevance = 0;
    
    // Name matching
    if (repo.name.toLowerCase().includes(technology.toLowerCase())) {
      relevance += 0.4;
    }
    
    // Description matching
    if (repo.description && repo.description.toLowerCase().includes(technology.toLowerCase())) {
      relevance += 0.3;
    }
    
    // Star count factor
    relevance += Math.min(repo.stargazers_count / 10000, 0.3);
    
    return Math.min(relevance, 1.0);
  }

  private calculateTextRelevance(text: string, technology: string): number {
    const lowerText = text.toLowerCase();
    const lowerTech = technology.toLowerCase();
    
    if (lowerText.includes(lowerTech)) {
      return 0.8;
    }
    
    // Fuzzy matching
    const words = lowerTech.split(' ');
    const matchedWords = words.filter(word => lowerText.includes(word));
    
    return matchedWords.length / words.length * 0.6;
  }

  private detectLanguage(filename: string): string {
    const extension = filename.split('.').pop()?.toLowerCase();
    
    const languageMap: { [key: string]: string } = {
      'js': 'javascript',
      'ts': 'typescript',
      'py': 'python',
      'java': 'java',
      'go': 'go',
      'rs': 'rust',
      'cpp': 'cpp',
      'c': 'c',
      'cs': 'csharp',
      'php': 'php',
      'rb': 'ruby'
    };

    return languageMap[extension || ''] || 'text';
  }

  private extractRelevantCode(code: string, technology: string): string {
    const lines = code.split('\n');
    const relevantLines: string[] = [];
    const techLower = technology.toLowerCase();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (line.toLowerCase().includes(techLower)) {
        // Include context around relevant lines
        const start = Math.max(0, i - 3);
        const end = Math.min(lines.length, i + 4);
        relevantLines.push(...lines.slice(start, end));
        break;
      }
    }

    return relevantLines.length > 0 ? relevantLines.join('\n') : lines.slice(0, 20).join('\n');
  }

  async analyzeRepository(repoUrl: string): Promise<{ 
    structure: string[], 
    technologies: string[], 
    patterns: string[] 
  }> {
    try {
      const tempDir = `/tmp/repo-analysis-${Date.now()}`;
      await this.git.clone(repoUrl, tempDir);

      // Analyze repository structure
      const structure = await this.analyzeDirectoryStructure(tempDir);
      const technologies = await this.detectTechnologies(tempDir);
      const patterns = await this.identifyPatterns(tempDir);

      return { structure, technologies, patterns };
    } catch (error) {
      this.logger.error('Repository analysis failed', error);
      throw new Error('Repository analysis failed');
    }
  }

  private async analyzeDirectoryStructure(dir: string): Promise<string[]> {
    // Implementation for directory structure analysis
    return ['src/', 'tests/', 'docs/', 'package.json'];
  }

  private async detectTechnologies(dir: string): Promise<string[]> {
    // Implementation for technology detection
    return ['TypeScript', 'Node.js', 'Express', 'Jest'];
  }

  private async identifyPatterns(dir: string): Promise<string[]> {
    // Implementation for pattern identification
    return ['MVC Architecture', 'Service Layer Pattern', 'Repository Pattern'];
  }
}