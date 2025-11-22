const express = require("express");
const {
    submitSupportRequest,
    submitFeedback,
} = require("../controllers/support-feedback-controller");

const router = express.Router();

router.post("/support", submitSupportRequest);
router.post("/feedback", submitFeedback);

module.exports = router;

