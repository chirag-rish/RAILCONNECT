const express = require("express");
const {
  createTicket,
  getTickets,
  getTicketDetail,
  addMessage,
  updateTicketStatus,
} = require("../controllers/supportController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);

router.post("/", createTicket);
router.get("/", getTickets);
router.get("/:id", getTicketDetail);
router.post("/:id/message", addMessage);
router.patch("/:id/status", updateTicketStatus);

module.exports = router;
