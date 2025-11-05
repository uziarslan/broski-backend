/**
 * Backend Configuration
 * Environment variables and settings
 */

module.exports = {
    // Server Configuration
    PORT: process.env.PORT || 4000,
    NODE_ENV: process.env.NODE_ENV || 'development',

    // Database
    MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/broski',

    // CORS Origins (for production)
    ADMIN_PANEL_URL: process.env.ADMIN_PANEL_URL,
    DOMAIN_FRONTEND: process.env.DOMAIN_FRONTEND,

    // AI API Keys
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    GROK_API_KEY: process.env.GROK_API_KEY,

    // ChatGPT Assistants
    CHATGPT_DAILYRIZZ_DRILL: process.env.CHATGPT_DAILYRIZZ_DRILL,
    CHATGPT_SCORE_DRILL: process.env.CHATGPT_SCORE_DRILL,
    CHATGPT_CONFIDENCE_MESSAGE: process.env.CHATGPT_CONFIDENCE_MESSAGE,
    CHATGPT_CHAT_REPLIES: process.env.CHATGPT_CHAT_REPLIES,
    CHATGPT_SCREENSHOT_ANALYSIS: process.env.CHATGPT_SCREENSHOT_ANALYSIS,
    CHATGPT_AWKWARD_SITUATIONS: process.env.CHATGPT_AWKWARD_SITUATIONS,

    // Cloudinary (for image generation)
    CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_KEY: process.env.CLOUDINARY_KEY,
    CLOUDINARY_SECRET: process.env.CLOUDINARY_SECRET,

    // Rate Limiting
    RATE_LIMIT_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    RATE_LIMIT_MAX_REQUESTS: 100, // per window

    // Usage Limits
    USAGE_LIMITS: {
        free: 2,
        pro: 50,
        gold: 1000
    },

    // API Security
    JWT_SECRET: process.env.JWT_SECRET || 'your-secret-key',

    // RevenueCat Configuration
    REVENUECAT_API_KEY: process.env.REVENUECAT_API_KEY, // Server-side API key from RevenueCat Dashboard
    REVENUECAT_WEBHOOK_SECRET: process.env.REVENUECAT_WEBHOOK_SECRET // Optional: for webhook signature verification
};
