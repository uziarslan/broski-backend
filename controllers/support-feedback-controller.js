const SupportRequest = require("../models/SupportRequest");
const Feedback = require("../models/Feedback");
const ExpressError = require("../utils/ExpressError");

const normalizeText = (value = "") => (typeof value === "string" ? value.trim() : "");
const normalizeMetadata = (metadata) =>
    metadata && typeof metadata === "object" ? metadata : {};

const sanitizeQueryValue = (value, allowedValues = []) => {
    const normalized = normalizeText(value);
    if (!normalized) return undefined;
    if (allowedValues.length === 0 || allowedValues.includes(normalized)) {
        return normalized;
    }
    return undefined;
};

const submitSupportRequest = async (req, res) => {
    const category = normalizeText(req.body?.category);
    const message = normalizeText(req.body?.message);
    const userId = normalizeText(req.body?.userId);
    const metadata = normalizeMetadata(req.body?.metadata);

    if (!category) {
        throw new ExpressError("Support category is required", 400);
    }
    if (!message) {
        throw new ExpressError("Support message is required", 400);
    }

    const entry = await SupportRequest.create({
        userId: userId || null,
        category,
        message,
        metadata,
    });

    res.status(201).json({
        success: true,
        message: "Support request received",
        data: entry,
    });
};

const listSupportRequests = async (req, res) => {
    const status = sanitizeQueryValue(req.query?.status, ['open', 'in_progress', 'resolved']);
    const filter = {};
    if (status) {
        filter.status = status;
    }

    const entries = await SupportRequest.find(filter)
        .sort({ createdAt: -1 })
        .lean();

    res.json({
        success: true,
        data: entries,
    });
};

const submitFeedback = async (req, res) => {
    const type = normalizeText(req.body?.type);
    const message = normalizeText(req.body?.message);
    const rating = Number.isFinite(req.body?.rating)
        ? Number(req.body.rating)
        : 0;
    const userId = normalizeText(req.body?.userId);
    const metadata = normalizeMetadata(req.body?.metadata);

    if (!type) {
        throw new ExpressError("Feedback type is required", 400);
    }
    if (!message) {
        throw new ExpressError("Feedback message is required", 400);
    }
    if (!rating || rating < 1 || rating > 5) {
        throw new ExpressError("Feedback rating must be between 1 and 5", 400);
    }

    const entry = await Feedback.create({
        userId: userId || null,
        type,
        message,
        rating,
        metadata,
    });

    res.status(201).json({
        success: true,
        message: "Feedback submitted",
        data: entry,
    });
};

const listFeedbackEntries = async (req, res) => {
    const type = sanitizeQueryValue(req.query?.type);
    const minRatingRaw = Number(req.query?.minRating);
    const minRating = Number.isFinite(minRatingRaw) ? Math.min(Math.max(Math.round(minRatingRaw), 1), 5) : undefined;

    const filter = {};
    if (type) {
        filter.type = type;
    }
    if (minRating) {
        filter.rating = { $gte: minRating };
    }

    const entries = await Feedback.find(filter)
        .sort({ createdAt: -1 })
        .lean();

    res.json({
        success: true,
        data: entries,
    });
};

module.exports = {
    submitSupportRequest,
    submitFeedback,
    listSupportRequests,
    listFeedbackEntries,
};

