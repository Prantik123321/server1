/**
 * Utility functions for the server
 */

/**
 * Generate a unique room ID
 * @returns {string} - 6-character room ID
 */
function generateRoomId() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

/**
 * Validate room ID format
 * @param {string} roomId - Room ID to validate
 * @returns {boolean} - True if valid
 */
function isValidRoomId(roomId) {
  return /^[A-Z0-9]{6}$/.test(roomId);
}

/**
 * Sanitize player name
 * @param {string} name - Player name
 * @returns {string} - Sanitized name
 */
function sanitizePlayerName(name) {
  // Remove any non-alphanumeric characters except spaces
  let sanitized = name.replace(/[^a-zA-Z0-9\s]/g, '');
  // Limit length to 20 characters
  sanitized = sanitized.substring(0, 20);
  // Default if empty
  if (sanitized.trim().length === 0) {
    sanitized = 'Player';
  }
  return sanitized;
}

/**
 * Get timestamp in milliseconds
 * @returns {number} - Current timestamp
 */
function getTimestamp() {
  return Date.now();
}

/**
 * Format date for logging
 * @returns {string} - Formatted date string
 */
function getLogDate() {
  return new Date().toISOString();
}

/**
 * Sleep/delay function
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} - Promise that resolves after delay
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  generateRoomId,
  isValidRoomId,
  sanitizePlayerName,
  getTimestamp,
  getLogDate,
  sleep
};