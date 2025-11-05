const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Admin = require('../models/Admin');
const ExpressError = require('../utils/ExpressError');
const config = require('../config');

// Admin login
const adminLogin = async (req, res) => {
    const { email, password } = req.body;

    // Find admin user in database
    const admin = await Admin.findOne({ email, isActive: true });
    if (!admin) {
        throw new ExpressError('Invalid credentials', 400);
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, admin.password);
    if (!isPasswordValid) {
        throw new ExpressError('Invalid credentials', 400);
    }

    // Update last login
    admin.lastLogin = new Date();
    await admin.save();

    // Generate JWT token
    const token = jwt.sign(
        {
            userId: admin._id,
            email: admin.email,
            role: admin.role
        },
        config.JWT_SECRET,
        { expiresIn: '24h' }
    );

    res.json({
        message: 'Login successful',
        token,
        user: {
            id: admin._id,
            email: admin.email,
            name: admin.name,
            role: admin.role
        }
    });
};

// Get current user (for token validation)
const getCurrentUser = async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        throw new ExpressError('No token provided', 401);
    }

    const decoded = jwt.verify(token, config.JWT_SECRET);

    // Find admin in database
    const admin = await Admin.findById(decoded.userId).select('-password');
    if (!admin) {
        throw new ExpressError('Admin not found', 401);
    }

    res.json({
        id: admin._id,
        email: admin.email,
        name: admin.name,
        role: admin.role
    });
};

// Admin registration (optional - for creating admin accounts)
const adminRegister = async (req, res) => {
    const { name, email, password } = req.body;

    // Check if admin already exists
    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
        throw new ExpressError('Admin already exists', 400);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create admin user
    const admin = new Admin({
        name,
        email,
        password: hashedPassword,
        role: 'admin'
    });

    await admin.save();

    // Generate JWT token
    const token = jwt.sign(
        {
            userId: admin._id,
            email: admin.email,
            role: admin.role
        },
        config.JWT_SECRET,
        { expiresIn: '24h' }
    );

    res.status(201).json({
        message: 'Admin created successfully',
        token,
        user: {
            id: admin._id,
            email: admin.email,
            name: admin.name,
            role: admin.role
        }
    });
};

module.exports = {
    adminLogin,
    getCurrentUser,
    adminRegister
};
