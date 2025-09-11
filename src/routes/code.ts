import { Router } from 'express';
import Joi from 'joi';
import { CodeGenerationService } from '../services/code-generation';
import { CodeGeneration, User } from '../services/database';
import { validateRequest } from '../middleware/auth';

const router = Router();

// Validation schemas
const codeGenerationSchema = Joi.object({
  language: Joi.string().required(),
  framework: Joi.string().optional(),
  description: Joi.string().required().min(10),
  requirements: Joi.array().items(Joi.string()).required(),
  context: Joi.string().optional(),
  projectId: Joi.string().optional()
});

const optimizeCodeSchema = Joi.object({
  code: Joi.string().required(),
  language: Joi.string().required()
});

const analyzeCodeSchema = Joi.object({
  code: Joi.string().required(),
  language: Joi.string().required()
});

export default function createCodeRoutes(codeGenerationService: CodeGenerationService) {
  // Generate code
  router.post('/generate', validateRequest(codeGenerationSchema), async (req: any, res) => {
    try {
      const startTime = Date.now();
      const { language, framework, description, requirements, context, projectId } = req.body;

      // Create database record
      const codeGeneration = new CodeGeneration({
        language,
        framework,
        description,
        requirements,
        context,
        userId: req.user._id,
        projectId,
        status: 'pending'
      });
      await codeGeneration.save();

      // Generate code
      const response = await codeGenerationService.generateCode({
        language,
        framework,
        description,
        requirements,
        context
      });

      // Analyze code quality
      const qualityAnalysis = await codeGenerationService.analyzeCodeQuality(response.code, language);

      // Update database record
      codeGeneration.response = response;
      codeGeneration.qualityScore = qualityAnalysis.score;
      codeGeneration.processingTime = Date.now() - startTime;
      codeGeneration.status = 'completed';
      await codeGeneration.save();

      res.json({
        id: codeGeneration._id,
        ...response,
        qualityScore: qualityAnalysis.score,
        qualitySuggestions: qualityAnalysis.suggestions,
        processingTime: codeGeneration.processingTime
      });
    } catch (error) {
      res.status(500).json({ error: 'Code generation failed' });
    }
  });

  // Optimize existing code
  router.post('/optimize', validateRequest(optimizeCodeSchema), async (req: any, res) => {
    try {
      const { code, language } = req.body;
      
      const optimizedCode = await codeGenerationService.optimizeCode(code, language);
      const qualityAnalysis = await codeGenerationService.analyzeCodeQuality(optimizedCode, language);

      res.json({
        originalCode: code,
        optimizedCode,
        qualityScore: qualityAnalysis.score,
        improvements: qualityAnalysis.suggestions
      });
    } catch (error) {
      res.status(500).json({ error: 'Code optimization failed' });
    }
  });

  // Analyze code quality
  router.post('/analyze', validateRequest(analyzeCodeSchema), async (req: any, res) => {
    try {
      const { code, language } = req.body;
      
      const analysis = await codeGenerationService.analyzeCodeQuality(code, language);

      res.json({
        score: analysis.score,
        suggestions: analysis.suggestions,
        grade: getGrade(analysis.score),
        metrics: {
          readability: Math.max(0, analysis.score - 10 + Math.random() * 20),
          maintainability: Math.max(0, analysis.score - 5 + Math.random() * 10),
          performance: Math.max(0, analysis.score - 15 + Math.random() * 30),
          security: Math.max(0, analysis.score - 8 + Math.random() * 16)
        }
      });
    } catch (error) {
      res.status(500).json({ error: 'Code analysis failed' });
    }
  });

  // Get generation history
  router.get('/history', async (req: any, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      const generations = await CodeGeneration.find({ userId: req.user._id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-response.code -response.tests'); // Exclude large fields for list view

      const total = await CodeGeneration.countDocuments({ userId: req.user._id });

      res.json({
        generations,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch history' });
    }
  });

  // Get specific generation
  router.get('/:id', async (req: any, res) => {
    try {
      const generation = await CodeGeneration.findOne({
        _id: req.params.id,
        userId: req.user._id
      });

      if (!generation) {
        return res.status(404).json({ error: 'Generation not found' });
      }

      res.json(generation);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch generation' });
    }
  });

  // Provide feedback
  router.post('/:id/feedback', async (req: any, res) => {
    try {
      const { helpful, rating, comments } = req.body;

      const generation = await CodeGeneration.findOneAndUpdate(
        { _id: req.params.id, userId: req.user._id },
        {
          $set: {
            'feedback.helpful': helpful,
            'feedback.rating': rating,
            'feedback.comments': comments
          }
        },
        { new: true }
      );

      if (!generation) {
        return res.status(404).json({ error: 'Generation not found' });
      }

      res.json({ message: 'Feedback recorded', feedback: generation.feedback });
    } catch (error) {
      res.status(500).json({ error: 'Failed to record feedback' });
    }
  });

  // Get supported languages
  router.get('/languages', (req, res) => {
    const languages = [
      { id: 'javascript', name: 'JavaScript', frameworks: ['express', 'react', 'vue', 'node'] },
      { id: 'typescript', name: 'TypeScript', frameworks: ['nestjs', 'angular', 'react', 'express'] },
      { id: 'python', name: 'Python', frameworks: ['django', 'flask', 'fastapi', 'pandas'] },
      { id: 'java', name: 'Java', frameworks: ['spring', 'springboot', 'android'] },
      { id: 'go', name: 'Go', frameworks: ['gin', 'echo', 'fiber'] },
      { id: 'rust', name: 'Rust', frameworks: ['actix', 'warp', 'rocket'] },
      { id: 'csharp', name: 'C#', frameworks: ['dotnet', 'aspnet', 'blazor'] },
      { id: 'php', name: 'PHP', frameworks: ['laravel', 'symfony', 'codeigniter'] },
      { id: 'ruby', name: 'Ruby', frameworks: ['rails', 'sinatra'] },
      { id: 'swift', name: 'Swift', frameworks: ['ios', 'vapor'] },
      { id: 'kotlin', name: 'Kotlin', frameworks: ['android', 'ktor'] }
    ];

    res.json(languages);
  });

  return router;
}

function getGrade(score: number): string {
  if (score >= 90) return 'A+';
  if (score >= 85) return 'A';
  if (score >= 80) return 'A-';
  if (score >= 75) return 'B+';
  if (score >= 70) return 'B';
  if (score >= 65) return 'B-';
  if (score >= 60) return 'C+';
  if (score >= 55) return 'C';
  if (score >= 50) return 'C-';
  if (score >= 45) return 'D+';
  if (score >= 40) return 'D';
  return 'F';
}