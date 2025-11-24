const express = require("express");
const {
    submitSupportRequest,
    submitFeedback,
    listSupportRequests,
    listFeedbackEntries,
} = require("../controllers/support-feedback-controller");
const { authenticateToken, requireAdmin } = require("../middleware/auth");

const router = express.Router();

router.post("/support", submitSupportRequest);
router.get("/support", authenticateToken, requireAdmin, listSupportRequests);
router.post("/feedback", submitFeedback);
router.get("/feedback", authenticateToken, requireAdmin, listFeedbackEntries);

module.exports = router;

