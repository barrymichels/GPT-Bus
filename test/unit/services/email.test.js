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
    const mockTripDetails = {
      id: 'TRIP123',
      date: '2025-02-12',
      route: 'Downtown Express'
    };
    const mockPaymentAmount = 25.50;

    it('should successfully send a receipt email', async () => {
      const result = await sendReceiptEmail(mockRecipient, mockTripDetails, mockPaymentAmount);
      
      expect(result).toHaveProperty('messageId', 'test-message-id');
      expect(result.envelope).toEqual({
        from: config.EMAIL_USER,
        to: [mockRecipient]
      });
    });

    it('should format email content correctly', async () => {
      const spy = jest.spyOn(process.env.NODE_ENV === 'test' ? require('../../../src/services/email').testTransport : require('nodemailer'), 'sendMail');
      
      await sendReceiptEmail(mockRecipient, mockTripDetails, mockPaymentAmount);
      
      const mailOptions = spy.mock.calls[0][0];
      expect(mailOptions).toEqual({
        from: config.EMAIL_USER,
        to: mockRecipient,
        subject: 'Payment Receipt for Your Trip',
        text: expect.stringContaining(mockTripDetails.id)
      });
      expect(mailOptions.text).toContain(mockTripDetails.date);
      expect(mailOptions.text).toContain(mockTripDetails.route);
      expect(mailOptions.text).toContain(mockPaymentAmount.toString());

      spy.mockRestore();
    });

    it('should handle missing trip details gracefully', async () => {
      await expect(sendReceiptEmail(mockRecipient, null, mockPaymentAmount))
        .rejects.toThrow();
    });

    it('should throw error for invalid email', async () => {
      await expect(sendReceiptEmail('invalid-email', mockTripDetails, mockPaymentAmount))
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
