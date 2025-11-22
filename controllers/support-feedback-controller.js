const SupportRequest = require("../models/SupportRequest");
const Feedback = require("../models/Feedback");
const ExpressError = require("../utils/ExpressError");

const normalizeText = (value = "") => (typeof value === "string" ? value.trim() : "");
const normalizeMetadata = (metadata) =>
    metadata && typeof metadata === "object" ? metadata : {};

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

module.exports = {
    submitSupportRequest,
    submitFeedback,
};

