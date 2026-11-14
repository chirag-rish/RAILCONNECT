const SupportTicket = require("../models/SupportTicket");
const Booking = require("../models/Booking");

exports.createTicket = async (req, res) => {
  try {
    const { subject, category, description, bookingId } = req.body;

    const ticket = new SupportTicket({
      user: req.user._id,
      booking: bookingId,
      subject,
      category,
      description,
      messages: [
        {
          sender: req.user._id,
          message: description,
        },
      ],
    });

    await ticket.save();
    res.status(201).json(ticket);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getTickets = async (req, res) => {
  try {
    const tickets = await SupportTicket.find({ user: req.user._id })
      .populate("user booking")
      .sort({ createdAt: -1 });
    res.json(tickets);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getTicketDetail = async (req, res) => {
  try {
    const ticket = await SupportTicket.findById(req.params.id).populate(
      "user booking messages.sender"
    );
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }
    res.json(ticket);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.addMessage = async (req, res) => {
  try {
    const { message } = req.body;
    const ticket = await SupportTicket.findById(req.params.id);

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    ticket.messages.push({
      sender: req.user._id,
      message,
    });

    await ticket.save();
    await ticket.populate("messages.sender");
    res.json(ticket);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateTicketStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const ticket = await SupportTicket.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    res.json(ticket);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
