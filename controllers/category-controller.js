const Category = require('../models/Category');
const TV = require('../models/TV');
const wrapAsync = require('../utils/wrapAsync');
const ExpressError = require('../utils/ExpressError');

// Get all categories
const getAllCategories = wrapAsync(async (req, res) => {
    const { isActive } = req.query;
    
    const query = {};
    if (isActive !== undefined) {
        query.isActive = isActive === 'true';
    }

    const categories = await Category.find(query)
        .populate('createdBy', 'name email')
        .sort({ order: 1, createdAt: -1 });

    res.json({
        success: true,
        data: categories
    });
});

// Get single category
const getCategory = wrapAsync(async (req, res) => {
    const { id } = req.params;

    const category = await Category.findById(id).populate('createdBy', 'name email');
    if (!category) {
        throw new ExpressError('Category not found', 404);
    }

    res.json({
        success: true,
        data: category
    });
});

// Create category
const createCategory = wrapAsync(async (req, res) => {
    const { name, icon, description, order } = req.body;
    const createdBy = req.user.userId; // From JWT token

    if (!name) {
        throw new ExpressError('Category name is required', 400);
    }

    // Check if category with same name or slug already exists
    const existingCategory = await Category.findOne({
        $or: [
            { name: { $regex: new RegExp(`^${name}$`, 'i') } },
            { slug: { $regex: new RegExp(`^${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}$`, 'i') } }
        ]
    });

    if (existingCategory) {
        throw new ExpressError('Category with this name already exists', 400);
    }

    // Generate slug from name
    const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

    const category = new Category({
        name,
        slug,
        icon: icon || 'ellipsis-horizontal',
        description: description || '',
        order: order || 0,
        createdBy
    });

    await category.save();

    res.status(201).json({
        success: true,
        message: 'Category created successfully',
        data: category
    });
});

// Update category
const updateCategory = wrapAsync(async (req, res) => {
    const { id } = req.params;
    const { name, icon, description, isActive, order } = req.body;

    const category = await Category.findById(id);
    if (!category) {
        throw new ExpressError('Category not found', 404);
    }

    // If name is being updated, check for duplicates
    if (name && name !== category.name) {
        const existingCategory = await Category.findOne({
            _id: { $ne: id },
            $or: [
                { name: { $regex: new RegExp(`^${name}$`, 'i') } },
                { slug: { $regex: new RegExp(`^${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}$`, 'i') } }
            ]
        });

        if (existingCategory) {
            throw new ExpressError('Category with this name already exists', 400);
        }
    }

    const updateData = {};
    if (name !== undefined) {
        updateData.name = name;
        // Regenerate slug when name changes
        updateData.slug = name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');
    }
    if (icon !== undefined) updateData.icon = icon;
    if (description !== undefined) updateData.description = description;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (order !== undefined) updateData.order = order;

    const updatedCategory = await Category.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
    ).populate('createdBy', 'name email');

    res.json({
        success: true,
        message: 'Category updated successfully',
        data: updatedCategory
    });
});

// Delete category
const deleteCategory = wrapAsync(async (req, res) => {
    const { id } = req.params;

    const category = await Category.findById(id);
    if (!category) {
        throw new ExpressError('Category not found', 404);
    }

    // Check if any videos are using this category
    const videosCount = await TV.countDocuments({ category: id });
    if (videosCount > 0) {
        throw new ExpressError(`Cannot delete category. ${videosCount} video(s) are using this category. Please reassign or delete those videos first.`, 400);
    }

    await Category.findByIdAndDelete(id);

    res.json({
        success: true,
        message: 'Category deleted successfully'
    });
});

module.exports = {
    getAllCategories,
    getCategory,
    createCategory,
    updateCategory,
    deleteCategory
};

