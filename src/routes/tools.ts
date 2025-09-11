import { Router } from 'express';
import Joi from 'joi';
import { ToolGenerationService } from '../services/tool-generation';
import { GeneratedTool } from '../services/database';
import { validateRequest } from '../middleware/auth';

const router = Router();

// Validation schemas
const toolGenerationSchema = Joi.object({
  type: Joi.string().valid('cli', 'library', 'framework', 'script').required(),
  name: Joi.string().required().min(2),
  description: Joi.string().required().min(10),
  features: Joi.array().items(Joi.string()).required(),
  targetLanguage: Joi.string().required(),
  projectId: Joi.string().optional()
});

const frameworkScaffoldSchema = Joi.object({
  frameworkName: Joi.string().required(),
  projectName: Joi.string().required().min(2),
  features: Joi.array().items(Joi.string()).required()
});

export default function createToolRoutes(toolGenerationService: ToolGenerationService) {
  // Generate a new tool
  router.post('/generate', validateRequest(toolGenerationSchema), async (req: any, res) => {
    try {
      const { type, name, description, features, targetLanguage, projectId } = req.body;

      // Generate the tool
      const generatedTool = await toolGenerationService.generateTool({
        type,
        name,
        description,
        features,
        targetLanguage
      });

      // Save to database
      const toolRecord = new GeneratedTool({
        name,
        type,
        description,
        userId: req.user._id,
        projectId,
        language: targetLanguage,
        code: generatedTool.code,
        documentation: generatedTool.documentation,
        tests: generatedTool.tests,
        packageJson: generatedTool.packageJson,
        setupInstructions: generatedTool.setupInstructions,
        features
      });
      await toolRecord.save();

      res.json({
        id: toolRecord._id,
        ...generatedTool,
        createdAt: toolRecord.createdAt
      });
    } catch (error) {
      res.status(500).json({ error: 'Tool generation failed' });
    }
  });

  // Generate framework scaffold
  router.post('/scaffold', validateRequest(frameworkScaffoldSchema), async (req: any, res) => {
    try {
      const { frameworkName, projectName, features } = req.body;

      const scaffold = await toolGenerationService.generateFrameworkScaffold(
        frameworkName,
        projectName,
        features
      );

      // Create a tool record for the scaffold
      const toolRecord = new GeneratedTool({
        name: `${projectName}-scaffold`,
        type: 'framework',
        description: `${frameworkName} scaffold for ${projectName}`,
        userId: req.user._id,
        language: getFrameworkLanguage(frameworkName),
        code: JSON.stringify(scaffold.files),
        features,
        setupInstructions: [
          '1. Extract the files to your project directory',
          '2. Install dependencies with npm install',
          '3. Follow the framework-specific setup instructions',
          '4. Start development with npm run dev'
        ]
      });
      await toolRecord.save();

      res.json({
        id: toolRecord._id,
        projectName,
        frameworkName,
        files: scaffold.files,
        fileCount: Object.keys(scaffold.files).length,
        setupInstructions: toolRecord.setupInstructions
      });
    } catch (error) {
      res.status(500).json({ error: 'Framework scaffold generation failed' });
    }
  });

  // Get user's generated tools
  router.get('/my-tools', async (req: any, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const skip = (page - 1) * limit;
      const type = req.query.type as string;

      const filter: any = { userId: req.user._id };
      if (type) {
        filter.type = type;
      }

      const tools = await GeneratedTool.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-code -tests -documentation'); // Exclude large fields for list view

      const total = await GeneratedTool.countDocuments(filter);

      res.json({
        tools,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch tools' });
    }
  });

  // Get specific tool
  router.get('/:id', async (req: any, res) => {
    try {
      const tool = await GeneratedTool.findOne({
        _id: req.params.id,
        userId: req.user._id
      });

      if (!tool) {
        return res.status(404).json({ error: 'Tool not found' });
      }

      res.json(tool);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch tool' });
    }
  });

  // Update tool (make public/private, add rating)
  router.patch('/:id', async (req: any, res) => {
    try {
      const { isPublic, version } = req.body;
      
      const updates: any = {};
      if (typeof isPublic === 'boolean') {
        updates.isPublic = isPublic;
      }
      if (version) {
        updates.version = version;
      }

      const tool = await GeneratedTool.findOneAndUpdate(
        { _id: req.params.id, userId: req.user._id },
        { $set: updates },
        { new: true }
      );

      if (!tool) {
        return res.status(404).json({ error: 'Tool not found' });
      }

      res.json({ message: 'Tool updated successfully', tool });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update tool' });
    }
  });

  // Delete tool
  router.delete('/:id', async (req: any, res) => {
    try {
      const tool = await GeneratedTool.findOneAndDelete({
        _id: req.params.id,
        userId: req.user._id
      });

      if (!tool) {
        return res.status(404).json({ error: 'Tool not found' });
      }

      res.json({ message: 'Tool deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete tool' });
    }
  });

  // Browse public tools
  router.get('/browse/public', async (req: any, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 12;
      const skip = (page - 1) * limit;
      const type = req.query.type as string;
      const language = req.query.language as string;
      const search = req.query.search as string;

      const filter: any = { isPublic: true };
      
      if (type) {
        filter.type = type;
      }
      
      if (language) {
        filter.language = language;
      }
      
      if (search) {
        filter.$or = [
          { name: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          { features: { $in: [new RegExp(search, 'i')] } }
        ];
      }

      const tools = await GeneratedTool.find(filter)
        .populate('userId', 'name')
        .sort({ downloads: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-code -tests -documentation');

      const total = await GeneratedTool.countDocuments(filter);

      res.json({
        tools,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        },
        filters: { type, language, search }
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to browse public tools' });
    }
  });

  // Download tool
  router.post('/:id/download', async (req: any, res) => {
    try {
      const tool = await GeneratedTool.findOne({
        _id: req.params.id,
        isPublic: true
      });

      if (!tool) {
        return res.status(404).json({ error: 'Tool not found or not public' });
      }

      // Increment download count
      await GeneratedTool.findByIdAndUpdate(tool._id, {
        $inc: { downloads: 1 }
      });

      res.json({
        name: tool.name,
        code: tool.code,
        documentation: tool.documentation,
        tests: tool.tests,
        packageJson: tool.packageJson,
        setupInstructions: tool.setupInstructions,
        downloadCount: tool.downloads + 1
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to download tool' });
    }
  });

  // Rate tool
  router.post('/:id/rate', async (req: any, res) => {
    try {
      const { rating, comment } = req.body;

      if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'Rating must be between 1 and 5' });
      }

      const tool = await GeneratedTool.findOne({
        _id: req.params.id,
        isPublic: true
      });

      if (!tool) {
        return res.status(404).json({ error: 'Tool not found or not public' });
      }

      // Check if user already rated this tool
      const existingRating = tool.ratings.find(r => r.userId?.toString() === req.user._id.toString());
      
      if (existingRating) {
        // Update existing rating
        existingRating.rating = rating;
        existingRating.comment = comment || '';
      } else {
        // Add new rating
        tool.ratings.push({
          userId: req.user._id,
          rating,
          comment: comment || '',
          createdAt: new Date()
        });
      }

      await tool.save();

      // Calculate average rating
      const avgRating = tool.ratings.reduce((sum, r) => sum + (r.rating || 0), 0) / tool.ratings.length;

      res.json({
        message: existingRating ? 'Rating updated' : 'Rating added',
        averageRating: Math.round(avgRating * 10) / 10,
        totalRatings: tool.ratings.length
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to rate tool' });
    }
  });

  // Get tool statistics
  router.get('/stats/overview', async (req: any, res) => {
    try {
      const userId = req.user._id;

      const stats = await GeneratedTool.aggregate([
        { $match: { userId } },
        {
          $group: {
            _id: null,
            totalTools: { $sum: 1 },
            totalDownloads: { $sum: '$downloads' },
            cliTools: { $sum: { $cond: [{ $eq: ['$type', 'cli'] }, 1, 0] } },
            libraries: { $sum: { $cond: [{ $eq: ['$type', 'library'] }, 1, 0] } },
            frameworks: { $sum: { $cond: [{ $eq: ['$type', 'framework'] }, 1, 0] } },
            scripts: { $sum: { $cond: [{ $eq: ['$type', 'script'] }, 1, 0] } },
            publicTools: { $sum: { $cond: ['$isPublic', 1, 0] } }
          }
        }
      ]);

      const result = stats[0] || {
        totalTools: 0,
        totalDownloads: 0,
        cliTools: 0,
        libraries: 0,
        frameworks: 0,
        scripts: 0,
        publicTools: 0
      };

      // Get language breakdown
      const languageStats = await GeneratedTool.aggregate([
        { $match: { userId } },
        { $group: { _id: '$language', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]);

      res.json({
        overview: result,
        languageBreakdown: languageStats
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch tool statistics' });
    }
  });

  return router;
}

function getFrameworkLanguage(frameworkName: string): string {
  const languages: { [key: string]: string } = {
    'react': 'typescript',
    'vue': 'javascript',
    'angular': 'typescript',
    'express': 'javascript',
    'nestjs': 'typescript',
    'django': 'python',
    'flask': 'python',
    'spring': 'java'
  };

  return languages[frameworkName.toLowerCase()] || 'javascript';
}