const express = require('express');
const multer = require('multer');
const router = express.Router();
const wrapAsync = require('../utils/wrapAsync');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { generalRateLimit, uploadRateLimit } = require('../middleware/rateLimiting');
const { thumbnailStorage } = require('../cloudinary/index.js');
const {
    getAllVideos,
    getVideo,
    addVideo,
    updateVideo,
    deleteVideo,
    incrementViews,
    toggleLike,
    getVideoStats,
    updateMissingThumbnails,
    testInstagramThumbnail
} = require('../controllers/tv-controller');

// Configure multer for thumbnail uploads
const uploadThumbnail = multer({
    storage: thumbnailStorage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit for thumbnails
    },
    fileFilter: (req, file, cb) => {
        // Only allow image files for thumbnails
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed for thumbnails'), false);
        }
    }
});


// ============ VIDEO ROUTES ============

// Get all videos (public, rate limited)
router.get('/', generalRateLimit, wrapAsync(getAllVideos));

// Get single video (public, rate limited)
router.get('/:id', generalRateLimit, wrapAsync(getVideo));

// Add video URL (admin only, rate limited)
router.post('/add', authenticateToken, requireAdmin, uploadRateLimit, uploadThumbnail.single('thumbnail'), wrapAsync(addVideo));

// Update video (admin only, rate limited)
router.put('/:id', authenticateToken, requireAdmin, generalRateLimit, wrapAsync(updateVideo));

// Delete video (admin only, rate limited)
router.delete('/:id', authenticateToken, requireAdmin, generalRateLimit, wrapAsync(deleteVideo));

// Increment views (public, rate limited)
router.post('/:id/view', generalRateLimit, wrapAsync(incrementViews));

// Toggle like (public, rate limited)
router.post('/:id/like', generalRateLimit, wrapAsync(toggleLike));

// Get video statistics (admin only, rate limited)
router.get('/stats/overview', authenticateToken, requireAdmin, generalRateLimit, wrapAsync(getVideoStats));

// Update missing thumbnails (admin only, rate limited)
router.post('/update-thumbnails', authenticateToken, requireAdmin, uploadRateLimit, wrapAsync(updateMissingThumbnails));

// Test Instagram thumbnail generation (admin only, rate limited)
router.post('/test-instagram-thumbnail', authenticateToken, requireAdmin, generalRateLimit, wrapAsync(testInstagramThumbnail));

module.exports = router;
