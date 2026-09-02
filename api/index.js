/**
 * Vercel Serverless Function entry point
 * Reuses the battle-tested handleRequest from server.js
 */
const { handleRequest } = require('../server.js');

module.exports = async (req, res) => {
  return handleRequest(req, res);
};
