const axios = require('axios');
const config = require('../config');

const REVENUECAT_API_KEY = config.REVENUECAT_API_KEY;
const REVENUECAT_BASE_URL = 'https://api.revenuecat.com/v1';

/**
 * RevenueCat Service
 * Handles all RevenueCat API interactions server-side
 */
class RevenueCatService {
    constructor() {
        if (!REVENUECAT_API_KEY) {
            console.warn('RevenueCat API key not configured. Subscription features may not work.');
        }
    }

    /**
     * Get RevenueCat API headers
     */
    getHeaders() {
        return {
            'Authorization': `Bearer ${REVENUECAT_API_KEY}`,
            'Content-Type': 'application/json',
            'X-Platform': 'backend'
        };
    }

    /**
     * Get customer info from RevenueCat
     * @param {string} appUserId - The user ID from your system
     * @returns {Promise<Object>} Customer info including entitlements
     */
    async getCustomerInfo(appUserId) {
        try {
            if (!REVENUECAT_API_KEY) {
                throw new Error('RevenueCat API key not configured');
            }

            const response = await axios.get(
                `${REVENUECAT_BASE_URL}/subscribers/${appUserId}`,
                { headers: this.getHeaders() }
            );

            return response.data;
        } catch (error) {
            console.error('Error fetching customer info from RevenueCat:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Check if user has active subscription
     * @param {string} appUserId - The user ID from your system
     * @returns {Promise<Object>} Subscription status and details
     */
    async checkSubscriptionStatus(appUserId) {
        try {
            const customerInfo = await this.getCustomerInfo(appUserId);
            const proEntitlement = customerInfo?.subscriber?.entitlements?.pro;

            const isActive = proEntitlement?.is_active === true;
            const expiresDate = proEntitlement?.expires_date;
            const productIdentifier = proEntitlement?.product_identifier || '';

            // Determine plan type from product identifier
            let planType = null;
            if (productIdentifier.includes('weekly')) planType = 'weekly';
            else if (productIdentifier.includes('monthly')) planType = 'monthly';
            else if (productIdentifier.includes('yearly')) planType = 'yearly';

            return {
                isActive,
                planType,
                productIdentifier,
                expiresDate,
                customerInfo
            };
        } catch (error) {
            console.error('Error checking subscription status:', error.message);
            return {
                isActive: false,
                planType: null,
                productIdentifier: null,
                expiresDate: null,
                error: error.message
            };
        }
    }

    /**
     * Grant entitlement to user (for promotional offers or manual grants)
     * @param {string} appUserId - The user ID from your system
     * @param {string} entitlementId - The entitlement ID (e.g., 'pro')
     * @param {Object} options - Grant options
     * @returns {Promise<Object>} Grant result
     */
    async grantEntitlement(appUserId, entitlementId = 'pro', options = {}) {
        try {
            if (!REVENUECAT_API_KEY) {
                throw new Error('RevenueCat API key not configured');
            }

            const response = await axios.post(
                `${REVENUECAT_BASE_URL}/subscribers/${appUserId}/entitlements/${entitlementId}`,
                {
                    expiration_at: options.expirationAt || null,
                    duration: options.duration || null, // e.g., 'P1M' for 1 month
                    ...options
                },
                { headers: this.getHeaders() }
            );

            return response.data;
        } catch (error) {
            console.error('Error granting entitlement:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Revoke entitlement from user
     * @param {string} appUserId - The user ID from your system
     * @param {string} entitlementId - The entitlement ID (e.g., 'pro')
     * @returns {Promise<Object>} Revoke result
     */
    async revokeEntitlement(appUserId, entitlementId = 'pro') {
        try {
            if (!REVENUECAT_API_KEY) {
                throw new Error('RevenueCat API key not configured');
            }

            const response = await axios.delete(
                `${REVENUECAT_BASE_URL}/subscribers/${appUserId}/entitlements/${entitlementId}`,
                { headers: this.getHeaders() }
            );

            return response.data;
        } catch (error) {
            console.error('Error revoking entitlement:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Verify webhook signature (optional but recommended)
     * @param {string} payload - Webhook payload
     * @param {string} signature - Webhook signature from headers
     * @returns {boolean} Whether signature is valid
     */
    verifyWebhookSignature(payload, signature) {
        // TODO: Implement webhook signature verification if you set up a webhook secret
        // For now, we'll trust the webhook if it contains valid RevenueCat data structure
        return true;
    }

    /**
     * Process webhook event
     * @param {Object} webhookData - Webhook payload from RevenueCat
     * @returns {Object} Processed webhook data
     */
    processWebhook(webhookData) {
        const event = webhookData.event;
        const customerInfo = event?.customer_info || {};
        const subscriber = customerInfo?.subscriber || {};
        const entitlements = subscriber?.entitlements || {};
        const proEntitlement = entitlements?.pro || {};

        return {
            type: event?.type, // e.g., 'INITIAL_PURCHASE', 'RENEWAL', 'CANCELLATION', etc.
            appUserId: event?.app_user_id,
            productId: event?.product_id,
            entitlement: proEntitlement?.is_active ? 'pro' : 'free',
            isActive: proEntitlement?.is_active === true,
            planType: this._extractPlanType(proEntitlement?.product_identifier),
            expiresDate: proEntitlement?.expires_date,
            originalAppUserId: event?.original_app_user_id,
            customerInfo
        };
    }

    /**
     * Extract plan type from product identifier
     * @private
     */
    _extractPlanType(productIdentifier) {
        if (!productIdentifier) return null;
        if (productIdentifier.includes('weekly')) return 'weekly';
        if (productIdentifier.includes('monthly')) return 'monthly';
        if (productIdentifier.includes('yearly')) return 'yearly';
        return null;
    }
}

module.exports = new RevenueCatService();

