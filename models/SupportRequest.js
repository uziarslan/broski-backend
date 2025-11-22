const mongoose = require('mongoose');

const supportRequestSchema = new mongoose.Schema(
    {
        userId: {
            type: String,
            default: null,
            index: true,
        },
        category: {
            type: String,
            required: true,
            trim: true,
        },
        message: {
            type: String,
            required: true,
            trim: true,
        },
        status: {
            type: String,
            enum: ['open', 'in_progress', 'resolved'],
            default: 'open',
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
        agentNotes: {
            type: String,
            default: '',
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model('SupportRequest', supportRequestSchema);

