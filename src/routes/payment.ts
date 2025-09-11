import { Router } from 'express';
import Joi from 'joi';
import { PaymentService } from '../services/payment';
import { User } from '../services/database';
import { validateRequest } from '../middleware/auth';

const router = Router();

// Validation schemas
const createPaymentIntentSchema = Joi.object({
  planId: Joi.string().required(),
  currency: Joi.string().default('usd')
});

const createSubscriptionSchema = Joi.object({
  planId: Joi.string().required(),
  paymentMethodId: Joi.string().required()
});

const updateSubscriptionSchema = Joi.object({
  planId: Joi.string().required()
});

export default function createPaymentRoutes(paymentService: PaymentService) {
  // Get available plans
  router.get('/plans', (req, res) => {
    try {
      const plans = paymentService.getPlans();
      res.json(plans);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch plans' });
    }
  });

  // Create payment intent
  router.post('/create-payment-intent', validateRequest(createPaymentIntentSchema), async (req: any, res) => {
    try {
      const { planId, currency } = req.body;
      
      const plan = paymentService.getPlan(planId);
      if (!plan) {
        return res.status(400).json({ error: 'Invalid plan ID' });
      }

      const clientSecret = await paymentService.createPaymentIntent(plan.price, currency);
      
      res.json({ 
        clientSecret,
        plan: {
          id: plan.id,
          name: plan.name,
          price: plan.price,
          currency: plan.currency
        }
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to create payment intent' });
    }
  });

  // Create subscription
  router.post('/create-subscription', validateRequest(createSubscriptionSchema), async (req: any, res) => {
    try {
      const { planId, paymentMethodId } = req.body;
      const user = req.user;

      // Create Stripe customer if doesn't exist
      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await paymentService.createCustomer(user.email, user.name);
        customerId = customer.id;
        
        await User.findByIdAndUpdate(user._id, {
          stripeCustomerId: customerId
        });
      }

      // Create subscription
      const subscription = await paymentService.createSubscription(customerId, planId);

      // Update user with subscription details
      await User.findByIdAndUpdate(user._id, {
        planId,
        subscriptionId: subscription.id,
        'usage.requestsThisMonth': 0, // Reset usage for new plan
        'usage.resetDate': new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      });

      res.json({
        subscriptionId: subscription.id,
        clientSecret: (subscription.latest_invoice as any)?.payment_intent?.client_secret,
        status: subscription.status
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to create subscription' });
    }
  });

  // Cancel subscription
  router.post('/cancel-subscription', async (req: any, res) => {
    try {
      const user = req.user;

      if (!user.subscriptionId) {
        return res.status(400).json({ error: 'No active subscription found' });
      }

      await paymentService.cancelSubscription(user.subscriptionId);

      // Update user to basic plan
      await User.findByIdAndUpdate(user._id, {
        planId: 'basic',
        subscriptionId: null,
        'usage.requestsThisMonth': 0,
        'usage.resetDate': new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      });

      res.json({ message: 'Subscription canceled successfully' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to cancel subscription' });
    }
  });

  // Update subscription
  router.post('/update-subscription', validateRequest(updateSubscriptionSchema), async (req: any, res) => {
    try {
      const { planId } = req.body;
      const user = req.user;

      if (!user.subscriptionId) {
        return res.status(400).json({ error: 'No active subscription found' });
      }

      const subscription = await paymentService.updateSubscription(user.subscriptionId, planId);

      // Update user plan
      await User.findByIdAndUpdate(user._id, {
        planId,
        'usage.requestsThisMonth': 0, // Reset usage for new plan
        'usage.resetDate': new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      });

      res.json({
        subscriptionId: subscription.id,
        status: subscription.status,
        newPlan: paymentService.getPlan(planId)
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update subscription' });
    }
  });

  // Get current subscription status
  router.get('/subscription-status', async (req: any, res) => {
    try {
      const user = req.user;
      const currentPlan = paymentService.getPlan(user.planId);

      res.json({
        plan: currentPlan,
        subscriptionId: user.subscriptionId,
        usage: user.usage,
        stripeCustomerId: user.stripeCustomerId
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch subscription status' });
    }
  });

  // Webhook endpoint for Stripe
  router.post('/webhook', async (req, res) => {
    try {
      const sig = req.headers['stripe-signature'];
      
      if (!sig) {
        return res.status(400).json({ error: 'Missing stripe signature' });
      }

      // Note: In production, you should verify the webhook signature
      const event = req.body;

      await paymentService.processWebhook(event);

      res.json({ received: true });
    } catch (error) {
      res.status(400).json({ error: 'Webhook processing failed' });
    }
  });

  // Get billing history
  router.get('/billing-history', async (req: any, res) => {
    try {
      const user = req.user;
      
      if (!user.stripeCustomerId) {
        return res.json({ invoices: [] });
      }

      // In a real implementation, you would fetch from Stripe
      // For now, return mock data
      const mockInvoices = [
        {
          id: 'in_1234567890',
          date: new Date(),
          amount: 99,
          currency: 'usd',
          status: 'paid',
          planName: 'Professional Plan'
        }
      ];

      res.json({ invoices: mockInvoices });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch billing history' });
    }
  });

  // Get usage statistics
  router.get('/usage', async (req: any, res) => {
    try {
      const user = req.user;
      const currentPlan = paymentService.getPlan(user.planId);

      const usagePercentage = currentPlan && currentPlan.maxRequests !== -1 
        ? (user.usage.requestsThisMonth / currentPlan.maxRequests) * 100 
        : 0;

      res.json({
        current: {
          requestsThisMonth: user.usage.requestsThisMonth,
          totalRequests: user.usage.totalRequests,
          lastRequest: user.usage.lastRequest,
          resetDate: user.usage.resetDate
        },
        plan: {
          name: currentPlan?.name,
          maxRequests: currentPlan?.maxRequests,
          usagePercentage: Math.round(usagePercentage)
        },
        warnings: {
          approaching_limit: usagePercentage > 80,
          over_limit: usagePercentage >= 100
        }
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch usage statistics' });
    }
  });

  return router;
}