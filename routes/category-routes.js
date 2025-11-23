const express = require('express');
const router = express.Router();
const wrapAsync = require('../utils/wrapAsync');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { generalRateLimit } = require('../middleware/rateLimiting');
const {
    getAllCategories,
    getCategory,
    createCategory,
    updateCategory,
    deleteCategory
} = require('../controllers/category-controller');

// ============ CATEGORY ROUTES ============

// Get all categories (public for mobile app, admin for admin panel)
router.get('/', generalRateLimit, wrapAsync(getAllCategories));

// Get single category (public)
router.get('/:id', generalRateLimit, wrapAsync(getCategory));

// Create category (admin only)
router.post('/', authenticateToken, requireAdmin, generalRateLimit, wrapAsync(createCategory));

// Update category (admin only)
router.put('/:id', authenticateToken, requireAdmin, generalRateLimit, wrapAsync(updateCategory));

// Delete category (admin only)
router.delete('/:id', authenticateToken, requireAdmin, generalRateLimit, wrapAsync(deleteCategory));

module.exports = router;

