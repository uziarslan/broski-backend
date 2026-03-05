const express = require('express'); // Updated to fix TypeScript cache
const router = express.Router();
const wrapAsync = require('../utils/wrapAsync');
const multer = require('multer');
const { screenshotStorage } = require('../cloudinary');
const { authenticateUser, requireValidSubscription, requireActiveUser, requireActiveSubscription } = require('../middleware/auth');
const { aiRateLimit } = require('../middleware/rateLimiting');
const { checkTrialRequestLimit } = require('../middleware/trialLimiting');
const {
    generateChatReplies,
    generateDailyRizzDrill,
    scoreRizzDrillResponse,
    generateConfidenceMessage,
    generateAwkwardSituationRecovery,
    analyzeScreenshot
} = require('../controllers/ai-controller');

// Configure multer to use CloudinaryStorage for screenshots
const upload = multer({
    storage: screenshotStorage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

// ============ AI SERVICE ROUTES ============

// Chat Coach - Generate reply suggestions (requires user authentication)
router.post('/chat-replies', authenticateUser, requireActiveUser, requireValidSubscription, requireActiveSubscription, checkTrialRequestLimit, aiRateLimit, wrapAsync(generateChatReplies));

// Rizz Drills - Generate daily drill (free, no subscription required)
router.get('/rizz-drill', authenticateUser, requireActiveUser, checkTrialRequestLimit, aiRateLimit, wrapAsync(generateDailyRizzDrill));

// Rizz Drills - Score user response (free, no subscription required)
router.post('/score-drill', authenticateUser, requireActiveUser, aiRateLimit, wrapAsync(scoreRizzDrillResponse));

// Confidence - Generate confidence message (free, no subscription required)
router.get('/confidence-message', authenticateUser, requireActiveUser, aiRateLimit, wrapAsync(generateConfidenceMessage));

// Awkward Situations - Generate recovery messages (free, no subscription required)
router.post('/awkward-situation-recovery', authenticateUser, requireActiveUser, checkTrialRequestLimit, aiRateLimit, wrapAsync(generateAwkwardSituationRecovery));

// Screenshot Analysis (requires user authentication)
router.post('/analyze-screenshot', authenticateUser, requireActiveUser, requireValidSubscription, requireActiveSubscription, checkTrialRequestLimit, aiRateLimit, upload.single('image'), wrapAsync(analyzeScreenshot));

module.exports = router;
