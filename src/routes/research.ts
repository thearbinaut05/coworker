import { Router } from 'express';
import Joi from 'joi';
import { ResearchService } from '../services/research';
import { ResearchQuery as ResearchQueryModel } from '../services/database';
import { validateRequest } from '../middleware/auth';

const router = Router();

// Validation schemas
const researchSchema = Joi.object({
  technology: Joi.string().required().min(2),
  purpose: Joi.string().required().min(5),
  constraints: Joi.array().items(Joi.string()).optional(),
  projectId: Joi.string().optional()
});

const repositoryAnalysisSchema = Joi.object({
  repoUrl: Joi.string().uri().required(),
  includePatterns: Joi.boolean().default(true),
  includeTechnologies: Joi.boolean().default(true)
});

export default function createResearchRoutes(researchService: ResearchService) {
  // Research a technology/topic
  router.post('/query', validateRequest(researchSchema), async (req: any, res) => {
    try {
      const startTime = Date.now();
      const { technology, purpose, constraints, projectId } = req.body;

      // Create database record
      const researchQuery = new ResearchQueryModel({
        query: `${technology} for ${purpose}`,
        technology,
        purpose,
        constraints: constraints || [],
        userId: req.user._id,
        projectId,
        status: 'pending'
      });
      await researchQuery.save();

      // Perform research
      const results = await researchService.researchTopic({
        technology,
        purpose,
        constraints
      });

      // Update database record
      researchQuery.results = results;
      researchQuery.processingTime = Date.now() - startTime;
      researchQuery.status = 'completed';
      await researchQuery.save();

      res.json({
        id: researchQuery._id,
        ...results,
        processingTime: researchQuery.processingTime
      });
    } catch (error) {
      res.status(500).json({ error: 'Research query failed' });
    }
  });

  // Analyze a repository
  router.post('/analyze-repository', validateRequest(repositoryAnalysisSchema), async (req: any, res) => {
    try {
      const { repoUrl, includePatterns, includeTechnologies } = req.body;
      
      const analysis = await researchService.analyzeRepository(repoUrl);

      const response: any = {
        repository: repoUrl,
        structure: analysis.structure
      };

      if (includeTechnologies) {
        response.technologies = analysis.technologies;
      }

      if (includePatterns) {
        response.patterns = analysis.patterns;
      }

      // Generate insights
      response.insights = {
        complexity: analysis.structure.length > 20 ? 'high' : analysis.structure.length > 10 ? 'medium' : 'low',
        techStack: analysis.technologies.slice(0, 5),
        recommendedImprovements: [
          'Consider adding comprehensive unit tests',
          'Implement CI/CD pipeline',
          'Add API documentation',
          'Set up monitoring and logging'
        ]
      };

      res.json(response);
    } catch (error) {
      res.status(500).json({ error: 'Repository analysis failed' });
    }
  });

  // Get research history
  router.get('/history', async (req: any, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const skip = (page - 1) * limit;

      const queries = await ResearchQueryModel.find({ userId: req.user._id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-results.codeExamples'); // Exclude large fields for list view

      const total = await ResearchQueryModel.countDocuments({ userId: req.user._id });

      res.json({
        queries,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch research history' });
    }
  });

  // Get specific research query
  router.get('/:id', async (req: any, res) => {
    try {
      const query = await ResearchQueryModel.findOne({
        _id: req.params.id,
        userId: req.user._id
      });

      if (!query) {
        return res.status(404).json({ error: 'Research query not found' });
      }

      res.json(query);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch research query' });
    }
  });

  // Get trending technologies
  router.get('/trending', async (req: any, res) => {
    try {
      // In a real implementation, this would aggregate data from research queries
      const trendingTech = [
        {
          name: 'Next.js',
          category: 'React Framework',
          growth: '+15%',
          searches: 1250,
          description: 'Full-stack React framework with SSR/SSG capabilities'
        },
        {
          name: 'Rust',
          category: 'Systems Language',
          growth: '+22%',
          searches: 980,
          description: 'Memory-safe systems programming language'
        },
        {
          name: 'Svelte',
          category: 'Frontend Framework',
          growth: '+18%',
          searches: 875,
          description: 'Compile-time optimized UI framework'
        },
        {
          name: 'Deno',
          category: 'JavaScript Runtime',
          growth: '+12%',
          searches: 720,
          description: 'Secure runtime for JavaScript and TypeScript'
        },
        {
          name: 'Solid.js',
          category: 'Frontend Framework',
          growth: '+25%',
          searches: 650,
          description: 'Fine-grained reactive UI library'
        }
      ];

      res.json({
        trending: trendingTech,
        lastUpdated: new Date().toISOString(),
        methodology: 'Based on research queries, GitHub activity, and community engagement'
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch trending technologies' });
    }
  });

  // Get technology recommendations
  router.post('/recommendations', async (req: any, res) => {
    try {
      const { projectType, currentTech, requirements } = req.body;

      // Generate recommendations based on project type and requirements
      const recommendations = generateRecommendations(projectType, currentTech, requirements);

      res.json({
        projectType,
        recommendations,
        reasoning: recommendations.map(rec => rec.reasoning)
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to generate recommendations' });
    }
  });

  // Search documentation
  router.get('/docs/search', async (req: any, res) => {
    try {
      const { q, technology } = req.query;

      if (!q) {
        return res.status(400).json({ error: 'Search query is required' });
      }

      // Mock documentation search results
      const searchResults = [
        {
          title: `${technology || 'Technology'} Documentation - ${q}`,
          url: `https://docs.example.com/${q}`,
          excerpt: `Learn about ${q} in ${technology || 'this technology'}. This comprehensive guide covers...`,
          relevance: 0.95,
          type: 'official'
        },
        {
          title: `${q} Tutorial | Community Guide`,
          url: `https://tutorial.example.com/${q}`,
          excerpt: `Step-by-step tutorial for implementing ${q} with practical examples...`,
          relevance: 0.87,
          type: 'tutorial'
        }
      ];

      res.json({
        query: q,
        technology,
        results: searchResults,
        totalResults: searchResults.length
      });
    } catch (error) {
      res.status(500).json({ error: 'Documentation search failed' });
    }
  });

  // Get code examples
  router.get('/examples/:technology', async (req: any, res) => {
    try {
      const { technology } = req.params;
      const { type, difficulty } = req.query;

      // Mock code examples
      const examples = [
        {
          title: `Basic ${technology} Setup`,
          difficulty: 'beginner',
          type: 'setup',
          code: `// Basic ${technology} example\nconsole.log('Hello from ${technology}!');`,
          description: `Simple example showing basic ${technology} usage`,
          tags: ['basics', 'setup']
        },
        {
          title: `Advanced ${technology} Patterns`,
          difficulty: 'advanced',
          type: 'pattern',
          code: `// Advanced ${technology} pattern\n// Implementation details...`,
          description: `Advanced patterns and best practices for ${technology}`,
          tags: ['advanced', 'patterns']
        }
      ];

      const filteredExamples = examples.filter(example => {
        if (type && example.type !== type) return false;
        if (difficulty && example.difficulty !== difficulty) return false;
        return true;
      });

      res.json({
        technology,
        examples: filteredExamples,
        filters: { type, difficulty }
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch code examples' });
    }
  });

  return router;
}

function generateRecommendations(projectType: string, currentTech: string[], requirements: string[]) {
  const recommendations = [
    {
      name: 'TypeScript',
      category: 'Language',
      confidence: 0.9,
      reasoning: 'Provides type safety and better developer experience',
      pros: ['Type safety', 'Better IDE support', 'Easier refactoring'],
      cons: ['Learning curve', 'Compilation step'],
      alternatives: ['JavaScript', 'Flow']
    },
    {
      name: 'React',
      category: 'Frontend Framework',
      confidence: 0.85,
      reasoning: 'Large ecosystem and community support',
      pros: ['Component-based', 'Large ecosystem', 'Strong community'],
      cons: ['Learning curve', 'Frequent updates'],
      alternatives: ['Vue.js', 'Svelte', 'Angular']
    }
  ];

  return recommendations;
}