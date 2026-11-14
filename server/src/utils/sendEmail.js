const nodemailer = require('nodemailer');

// In dev/test mode we avoid making real SMTP connections for speed and stability.
const isDevOrTestEnv = ['development', 'test'].includes(process.env.NODE_ENV);

// Create reusable transporter using SendGrid SMTP
const createTransporter = () => {
    if (isDevOrTestEnv) {
        return null;
    }

    return nodemailer.createTransport({
        host: 'smtp.sendgrid.net',
        port: 587,
        secure: false,
        auth: {
            user: 'apikey',
            pass: process.env.SENDGRID_API_KEY,
        },
    });
};

// ---- HTML Email Templates ----

const bookingConfirmationHTML = (data) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 20px; }
    .container { background: white; max-width: 600px; margin: 0 auto; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #1e3a8a, #2563eb); color: white; padding: 32px; text-align: center; }
    .header h1 { margin: 0; font-size: 28px; }
    .header p { margin: 8px 0 0; opacity: 0.85; }
    .body { padding: 32px; }
    .ticket-card { background: #f0f7ff; border: 2px dashed #93c5fd; border-radius: 12px; padding: 24px; margin: 20px 0; }
    .route { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
    .station { text-align: center; }
    .station .code { font-size: 24px; font-weight: bold; color: #1e3a8a; }
    .station .name { font-size: 13px; color: #64748b; margin-top: 4px; }
    .arrow { font-size: 24px; color: #2563eb; flex: 1; text-align: center; }
    .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
    .detail-row:last-child { border: none; }
    .label { color: #64748b; font-size: 13px; }
    .value { font-weight: 600; color: #0f172a; }
    .pnr { background: #1e3a8a; color: white; text-align: center; padding: 16px; border-radius: 8px; margin: 16px 0; }
    .pnr .pnr-label { font-size: 12px; opacity: 0.8; text-transform: uppercase; letter-spacing: 1px; }
    .pnr .pnr-number { font-size: 28px; font-weight: bold; letter-spacing: 4px; margin-top: 4px; }
    .passengers { margin: 20px 0; }
    .passenger-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f1f5f9; }
    .badge { display: inline-block; background: #dcfce7; color: #166534; padding: 3px 10px; border-radius: 99px; font-size: 12px; font-weight: 600; }
    .total { background: #f8fafc; border-radius: 8px; padding: 16px; display: flex; justify-content: space-between; align-items: center; margin: 20px 0; }
    .footer { background: #f8fafc; padding: 24px; text-align: center; color: #94a3b8; font-size: 13px; }
    .footer a { color: #2563eb; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🚆 RailConnect</h1>
      <p>Your booking is confirmed!</p>
    </div>
    <div class="body">
      <p>Hi <strong>${data.userName}</strong>, your ticket has been booked successfully.</p>
      
      <div class="ticket-card">
        <div class="route">
          <div class="station"><div class="code">${data.source}</div><div class="name">${data.sourceName || data.source}</div></div>
          <div class="arrow">→</div>
          <div class="station"><div class="code">${data.destination}</div><div class="name">${data.destinationName || data.destination}</div></div>
        </div>
        
        <div class="pnr">
          <div class="pnr-label">PNR Number</div>
          <div class="pnr-number">${data.pnr}</div>
        </div>
        
        <div class="detail-row"><span class="label">Train</span><span class="value">${data.trainName} (${data.trainNumber})</span></div>
        <div class="detail-row"><span class="label">Journey Date</span><span class="value">${data.journeyDate}</span></div>
        <div class="detail-row"><span class="label">Departure</span><span class="value">${data.departureTime}</span></div>
        <div class="detail-row"><span class="label">Class</span><span class="value">${data.travelClass}</span></div>
      </div>

      <div class="passengers">
        <h3 style="color:#1e3a8a;margin-bottom:12px;">Passengers</h3>
        ${data.passengers.map((p, i) => `
          <div class="passenger-row">
            <span>${i + 1}. ${p.name} (${p.age} yrs)</span>
            <span style="color:#64748b">${p.assignedSeat || 'Seat TBA'} <span class="badge">${p.status || 'CNF'}</span></span>
          </div>
        `).join('')}
      </div>

      <div class="total">
        <span style="color:#64748b;font-size:14px;">Total Fare Paid</span>
        <span style="font-size:22px;font-weight:bold;color:#1e3a8a;">₹${data.totalFare}</span>
      </div>

      <p style="color:#64748b;font-size:13px;">💡 <strong>Tip:</strong> Keep this email or your PNR handy during your journey for TTE verification.</p>
    </div>
    <div class="footer">
      <p>RailConnect — Powered by your trust</p>
      <p><a href="https://railconnect.in/my-bookings">View Booking</a> · <a href="https://railconnect.in/support">Support</a></p>
    </div>
  </div>
</body>
</html>`;

const cancellationHTML = (data) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 20px; }
    .container { background: white; max-width: 600px; margin: 0 auto; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #7f1d1d, #dc2626); color: white; padding: 32px; text-align: center; }
    .body { padding: 32px; }
    .refund-box { background: #f0fdf4; border: 2px solid #86efac; border-radius: 12px; padding: 24px; text-align: center; margin: 20px 0; }
    .refund-amount { font-size: 36px; font-weight: bold; color: #166534; }
    .footer { background: #f8fafc; padding: 24px; text-align: center; color: #94a3b8; font-size: 13px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Booking Cancelled</h1>
      <p>PNR: ${data.pnr}</p>
    </div>
    <div class="body">
      <p>Hi <strong>${data.userName}</strong>, your booking has been cancelled.</p>
      <p><strong>Journey:</strong> ${data.source} → ${data.destination} on ${data.journeyDate}</p>
      
      <div class="refund-box">
        <p style="color:#166534;margin:0 0 8px">Refund Amount</p>
        <div class="refund-amount">₹${data.refundAmount}</div>
        <p style="color:#64748b;font-size:13px;margin:8px 0 0">Will be credited to your RailConnect wallet within 24 hours</p>
      </div>
      
      <p style="color:#64748b;font-size:13px;">Refund policy: 80% of fare refunded when cancelled more than 24h before departure.</p>
    </div>
    <div class="footer">
      <p>Questions? <a href="https://railconnect.in/support" style="color:#2563eb">Contact Support</a></p>
    </div>
  </div>
</body>
</html>`;

// ---- Main sendEmail function ----

const sendEmail = async (to, subject, text, htmlTemplate = null) => {
    // Test mode: skip actual SMTP to avoid slow tests and open handles.
    if (isDevOrTestEnv) {
        console.log('\n--- [EMAIL SIMULATION - TEST MODE] ---');
        console.log(`To: ${to}`);
        console.log(`Subject: ${subject}`);
        console.log(`Body: ${text}`);
        console.log('--------------------------\n');
        return true;
    }

    // Development mode: log if SendGrid is not configured.
    if (process.env.NODE_ENV === 'development' && !process.env.SENDGRID_API_KEY) {
        console.log('\n--- [EMAIL SIMULATION] ---');
        console.log(`To: ${to}`);
        console.log(`Subject: ${subject}`);
        console.log(`Body: ${text}`);
        console.log('--------------------------\n');
        return true;
    }

    try {
        const transporter = createTransporter();

        const mailOptions = {
            from: `RailConnect <${process.env.FROM_EMAIL || 'noreply@railconnect.in'}>`,
            to,
            subject,
            text,
            ...(htmlTemplate && { html: htmlTemplate }),
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`Email sent: ${info.messageId}`);
        return true;
    } catch (error) {
        console.error('Email send failed:', error.message);
        // Don't throw — email failure shouldn't break booking flow
        return false;
    }
};

// ---- Convenience wrappers ----

const sendBookingConfirmation = (userEmail, data) =>
    sendEmail(
        userEmail,
        `Booking Confirmed — PNR ${data.pnr} | RailConnect`,
        `Your booking from ${data.source} to ${data.destination} is confirmed. PNR: ${data.pnr}. Total Fare: ₹${data.totalFare}`,
        bookingConfirmationHTML(data)
    );

const sendCancellationEmail = (userEmail, data) =>
    sendEmail(
        userEmail,
        `Booking Cancelled — PNR ${data.pnr} | RailConnect`,
        `Your booking PNR ${data.pnr} has been cancelled. Refund: ₹${data.refundAmount}`,
        cancellationHTML(data)
    );

// Default export is the sendEmail function for backwards compatibility (existing call sites)
module.exports = sendEmail;
module.exports.sendBookingConfirmation = sendBookingConfirmation;
module.exports.sendCancellationEmail = sendCancellationEmail;