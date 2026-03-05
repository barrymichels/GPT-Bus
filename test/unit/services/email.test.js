const { sendReceiptEmail } = require('../../../src/services/email');
const config = require('../../../src/config');

describe('Email Service', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  
  beforeEach(() => {
    // Ensure we're in test environment
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  describe('sendReceiptEmail', () => {
    const mockRecipient = 'test@example.com';
    const mockReceiptDetails = {
      riderName: 'John Doe',
      date: '2025-02-12',
      amount: '25.50',
      payments: [{ date: '2025-01-10', amount: '50.00' }]
    };

    it('should successfully send a receipt email', async () => {
      const result = await sendReceiptEmail(mockRecipient, mockReceiptDetails);

      expect(result).toHaveProperty('messageId', 'test-message-id');
      expect(result.envelope).toEqual({
        from: config.EMAIL_USER,
        to: [mockRecipient]
      });
    });

    it('should format email content correctly', async () => {
      const spy = jest.spyOn(require('../../../src/services/email').testTransport, 'sendMail');

      await sendReceiptEmail(mockRecipient, mockReceiptDetails);

      const mailOptions = spy.mock.calls[0][0];
      expect(mailOptions.from).toBe(config.EMAIL_USER);
      expect(mailOptions.to).toBe(mockRecipient);
      expect(mailOptions.subject).toBe('Payment Receipt');
      expect(mailOptions.html).toContain(mockReceiptDetails.riderName);
      expect(mailOptions.html).toContain(mockReceiptDetails.date);
      expect(mailOptions.html).toContain('$25.50');
      expect(mailOptions.html).toContain('$50.00');

      spy.mockRestore();
    });

    it('should handle missing receipt details gracefully', async () => {
      await expect(sendReceiptEmail(mockRecipient, null))
        .rejects.toThrow();
    });

    it('should send email for any recipient format', async () => {
      await expect(sendReceiptEmail('invalid-email', mockReceiptDetails))
        .resolves.toHaveProperty('messageId');
    });
  });

  describe('Email Transport', () => {
    it('should use test transport in test environment', () => {
      process.env.NODE_ENV = 'test';
      const emailModule = require('../../../src/services/email');
      expect(emailModule.testTransport).toBeDefined();
    });

    it('should use nodemailer transport in non-test environment', () => {
      process.env.NODE_ENV = 'production';
      jest.resetModules();
      const nodemailer = require('nodemailer');
      const createTransportSpy = jest.spyOn(nodemailer, 'createTransport');
      
      require('../../../src/services/email');
      
      expect(createTransportSpy).toHaveBeenCalledWith({
        service: 'gmail',
        auth: {
          user: config.EMAIL_USER,
          pass: config.EMAIL_PASS
        }
      });
      
      createTransportSpy.mockRestore();
    });
  });
});
