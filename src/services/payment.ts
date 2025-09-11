import Stripe from 'stripe';
import { PaymentPlan, User } from '../types/index';
import { Logger } from '../utils/logger';

export class PaymentService {
  private stripe: Stripe;
  private logger: Logger;
  private plans!: PaymentPlan[];

  constructor(config: { stripe: { secretKey: string; publishableKey: string } }) {
    this.stripe = new Stripe(config.stripe.secretKey, {
      apiVersion: '2023-08-16',
    });
    this.logger = new Logger();
    this.initializePlans();
  }

  private initializePlans(): void {
    this.plans = [
      {
        id: 'basic',
        name: 'Basic Plan',
        price: 29,
        currency: 'usd',
        interval: 'month',
        features: [
          '1,000 AI code generations per month',
          'Basic documentation access',
          'Standard support',
          'Single project workspace'
        ],
        maxRequests: 1000
      },
      {
        id: 'pro',
        name: 'Professional Plan',
        price: 99,
        currency: 'usd',
        interval: 'month',
        features: [
          '10,000 AI code generations per month',
          'Advanced research capabilities',
          'Priority support',
          'Unlimited project workspaces',
          'Custom tool generation',
          'API access'
        ],
        maxRequests: 10000
      },
      {
        id: 'enterprise',
        name: 'Enterprise Plan',
        price: 299,
        currency: 'usd',
        interval: 'month',
        features: [
          'Unlimited AI code generations',
          'Advanced autonomous capabilities',
          'Dedicated support',
          'Custom integrations',
          'On-premise deployment option',
          'Advanced analytics',
          'Custom AI model training'
        ],
        maxRequests: -1 // Unlimited
      }
    ];
  }

  async createPaymentIntent(amount: number, currency: string = 'usd'): Promise<string> {
    try {
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: amount * 100, // Convert to cents
        currency,
        automatic_payment_methods: {
          enabled: true,
        },
      });

      return paymentIntent.client_secret!;
    } catch (error) {
      this.logger.error('Failed to create payment intent', error);
      throw new Error('Payment processing failed');
    }
  }

  async createSubscription(customerId: string, planId: string): Promise<Stripe.Subscription> {
    try {
      const plan = this.plans.find(p => p.id === planId);
      if (!plan) {
        throw new Error('Invalid plan ID');
      }

      // Create or retrieve price object
      const price = await this.getOrCreatePrice(plan);

      const subscription = await this.stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: price.id }],
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        expand: ['latest_invoice.payment_intent'],
      });

      return subscription;
    } catch (error) {
      this.logger.error('Failed to create subscription', error);
      throw new Error('Subscription creation failed');
    }
  }

  async createCustomer(email: string, name: string): Promise<Stripe.Customer> {
    try {
      const customer = await this.stripe.customers.create({
        email,
        name,
      });

      return customer;
    } catch (error) {
      this.logger.error('Failed to create customer', error);
      throw new Error('Customer creation failed');
    }
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    try {
      await this.stripe.subscriptions.cancel(subscriptionId);
    } catch (error) {
      this.logger.error('Failed to cancel subscription', error);
      throw new Error('Subscription cancellation failed');
    }
  }

  async updateSubscription(subscriptionId: string, newPlanId: string): Promise<Stripe.Subscription> {
    try {
      const plan = this.plans.find(p => p.id === newPlanId);
      if (!plan) {
        throw new Error('Invalid plan ID');
      }

      const price = await this.getOrCreatePrice(plan);
      const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);

      const updatedSubscription = await this.stripe.subscriptions.update(subscriptionId, {
        items: [
          {
            id: subscription.items.data[0].id,
            price: price.id,
          },
        ],
      });

      return updatedSubscription;
    } catch (error) {
      this.logger.error('Failed to update subscription', error);
      throw new Error('Subscription update failed');
    }
  }

  private async getOrCreatePrice(plan: PaymentPlan): Promise<Stripe.Price> {
    try {
      // Check if price already exists
      const prices = await this.stripe.prices.list({
        lookup_keys: [plan.id],
      });

      if (prices.data.length > 0) {
        return prices.data[0];
      }

      // Create new price
      const price = await this.stripe.prices.create({
        unit_amount: plan.price * 100,
        currency: plan.currency,
        recurring: { interval: plan.interval },
        product_data: {
          name: plan.name,
        },
        lookup_key: plan.id,
      });

      return price;
    } catch (error) {
      this.logger.error('Failed to get or create price', error);
      throw new Error('Price management failed');
    }
  }

  getPlans(): PaymentPlan[] {
    return this.plans;
  }

  getPlan(planId: string): PaymentPlan | undefined {
    return this.plans.find(p => p.id === planId);
  }

  async processWebhook(event: Stripe.Event): Promise<void> {
    try {
      switch (event.type) {
        case 'payment_intent.succeeded':
          await this.handlePaymentSuccess(event.data.object as Stripe.PaymentIntent);
          break;
        case 'payment_intent.payment_failed':
          await this.handlePaymentFailure(event.data.object as Stripe.PaymentIntent);
          break;
        case 'customer.subscription.created':
          await this.handleSubscriptionCreated(event.data.object as Stripe.Subscription);
          break;
        case 'customer.subscription.deleted':
          await this.handleSubscriptionCanceled(event.data.object as Stripe.Subscription);
          break;
        default:
          this.logger.info(`Unhandled event type: ${event.type}`);
      }
    } catch (error) {
      this.logger.error('Webhook processing failed', error);
      throw new Error('Webhook processing failed');
    }
  }

  private async handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    this.logger.info('Payment succeeded', { paymentIntentId: paymentIntent.id });
    // Implementation for payment success handling
  }

  private async handlePaymentFailure(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    this.logger.warn('Payment failed', { paymentIntentId: paymentIntent.id });
    // Implementation for payment failure handling
  }

  private async handleSubscriptionCreated(subscription: Stripe.Subscription): Promise<void> {
    this.logger.info('Subscription created', { subscriptionId: subscription.id });
    // Implementation for subscription creation handling
  }

  private async handleSubscriptionCanceled(subscription: Stripe.Subscription): Promise<void> {
    this.logger.info('Subscription canceled', { subscriptionId: subscription.id });
    // Implementation for subscription cancellation handling
  }
}