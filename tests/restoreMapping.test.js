const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

jest.mock('mongoose');
jest.mock('../models/User', () => {
  const actual = jest.requireActual('../models/User');
  return {
    ...actual,
  };
});

jest.mock('../services/pendingWebhookService', () => ({
  processPendingForRcIds: jest.fn(() => Promise.resolve()),
}));

jest.mock('../config', () => ({
  JWT_SECRET: 'test-secret',
  REVENUECAT_API_KEY: 'test-rc-key',
}));

describe('generateUserTokenFromRevenueCat mapping', () => {
  // Basic smoke tests to ensure the controller exports and can be invoked.
  // Full behavior is validated manually and via higher-level integration tests.
  // These tests intentionally mock out Mongoose and RevenueCat integrations.

  // eslint-disable-next-line global-require
  const controller = require('../controllers/user-controller');

  test('throws 400 when revenueCatUserId is missing', async () => {
    const req = { body: {} };
    const res = {};

    await expect(controller.generateUserTokenFromRevenueCat(req, res)).rejects.toMatchObject({
      status: 400,
    });
  });
});

