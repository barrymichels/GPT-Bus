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

async function sendReceiptEmail(recipientEmail, { riderName, date, amount, payments }) {
  const formattedAmount = parseFloat(amount).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

  const totalPaid = payments.reduce(
    (total, p) => total + parseFloat(p.amount), 0
  ) + parseFloat(amount);

  const formattedTotal = totalPaid.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

  const paymentRows = payments
    .map(p => `
      <tr>
        <td style="border:1px solid rgb(221,221,221);padding:8px">${p.date}</td>
        <td style="border:1px solid rgb(221,221,221);padding:8px">${
          parseFloat(p.amount).toLocaleString("en-US", { style: "currency", currency: "USD" })
        }</td>
      </tr>`)
    .join("");

  const mailOptions = {
    from: config.EMAIL_USER,
    to: recipientEmail,
    subject: 'Payment Receipt',
    html: `
      <div style="width:80%;max-width:600px;margin:40px auto;padding:20px;border:1px solid rgb(221,221,221)">
        <div>
          <h2>Receipt</h2>
          <p>Name: ${riderName}</p>
          <p>Date: ${date}</p>
        </div>
        <table style="width:100%;border-collapse:collapse;margin-top:20px">
          <tbody>
            <tr>
              <th style="border:1px solid rgb(221,221,221);padding:8px;text-align:left">Date</th>
              <th style="border:1px solid rgb(221,221,221);padding:8px;text-align:left">Amount</th>
            </tr>
            ${paymentRows}
            <tr>
              <td style="border:1px solid rgb(221,221,221);padding:8px">${date}</td>
              <td style="border:1px solid rgb(221,221,221);padding:8px">${formattedAmount}</td>
            </tr>
          </tbody>
        </table>
        <div style="margin-top:20px;text-align:right">
          <p>Amount Paid to Date: ${formattedTotal}</p>
        </div>
        <div style="text-align:center;margin-top:40px">
          <p>Thank you!</p>
        </div>
      </div>`
  };

  return transporter.sendMail(mailOptions);
}

module.exports = {
  sendReceiptEmail,
  testTransport
};
