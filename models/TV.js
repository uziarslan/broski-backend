const mongoose = require('mongoose');

const tvSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    videoUrl: {
        type: String,
        required: true,
        trim: true
    },
    platform: {
        type: String,
        enum: ['youtube', 'tiktok', 'instagram', 'vimeo'],
        required: true
    },
    videoId: {
        type: String, // Platform-specific video ID (e.g., YouTube video ID)
        required: true
    },
    thumbnail: {
        type: String, // Platform thumbnail URL
        default: ''
    },
    duration: {
        type: Number, // in seconds
        default: 0
    },
    isActive: {
        type: Boolean,
        default: true
    },
    uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin',
        required: true
    },
    tags: [{
        type: String,
        trim: true
    }],
    category: {
        type: String,
        enum: ['tutorial', 'demo', 'announcement', 'other'],
        default: 'other'
    },
    views: {
        type: Number,
        default: 0
    },
    likes: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

// Index for better query performance
tvSchema.index({ isActive: 1, category: 1 });
tvSchema.index({ uploadedBy: 1 });
tvSchema.index({ createdAt: -1 });

module.exports = mongoose.model('TV', tvSchema);
