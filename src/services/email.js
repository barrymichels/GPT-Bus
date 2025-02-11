const nodemailer = require('nodemailer');
const config = require('../config');

// Create test transport for test environment
const testTransport = {
  sendMail: (mailOptions) => {
    // Mock successful email sending
    return Promise.resolve({
      messageId: 'test-message-id',
      envelope: {
        from: mailOptions.from,
        to: [mailOptions.to]
      }
    });
  }
};

// Use test transport in test environment
const transporter = process.env.NODE_ENV === 'test' 
  ? testTransport
  : nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: config.EMAIL_USER,
        pass: config.EMAIL_PASS
      }
    });

async function sendReceiptEmail(recipientEmail, tripDetails, paymentAmount) {
  const mailOptions = {
    from: config.EMAIL_USER,
    to: recipientEmail,
    subject: 'Payment Receipt for Your Trip',
    text: `Thank you for your payment of $${paymentAmount} for trip ${tripDetails.id}.
           Trip details:
           Date: ${tripDetails.date}
           Route: ${tripDetails.route}
           This is your payment confirmation.`
  };

  return transporter.sendMail(mailOptions);
}

module.exports = {
  sendReceiptEmail
};
