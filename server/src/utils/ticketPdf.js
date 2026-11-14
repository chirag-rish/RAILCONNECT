const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const Booking = require('../models/Booking');
const Train = require('../models/Train');

// Generate a ticket PDF and return the file path
async function generateTicketPDF(bookingId) {
  const booking = await Booking.findById(bookingId).populate('train');
  if (!booking) throw new Error('Booking not found');

  const doc = new PDFDocument();
  const fileName = `ticket_${booking.pnr}.pdf`;
  const filePath = path.join(__dirname, '../../public/tickets', fileName);

  // Ensure directory exists
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  doc.fontSize(20).text('RailConnect Ticket', { align: 'center' });
  doc.moveDown();
  doc.fontSize(14).text(`PNR: ${booking.pnr}`);
  doc.text(`Train: ${booking.train.name} (${booking.train.trainNumber})`);
  doc.text(`From: ${booking.train.source}  To: ${booking.train.destination}`);
  doc.text(`Date: ${booking.journeyDate.toDateString()}`);
  doc.text(`Class: ${booking.travelClass}`);
  doc.text(`Status: ${booking.status}`);
  doc.moveDown();
  doc.text('Passengers:');
  booking.passengers.forEach((p, i) => {
    doc.text(`${i + 1}. ${p.name}, Age: ${p.age}, Gender: ${p.gender}, Seat: ${p.assigned_seat}`);
  });
  doc.moveDown();
  doc.text(`Total Fare: ₹${booking.totalFare}`);
  doc.end();

  // Wait for file to finish writing
  await new Promise((resolve) => stream.on('finish', resolve));
  return `/tickets/${fileName}`;
}

module.exports = { generateTicketPDF };