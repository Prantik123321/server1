/**
 * Room Management System
 * Manages game rooms and player sessions
 */

class GameRoom {
  constructor(id, host) {
    this.id = id;
    this.players = [host];
    this.createdAt = Date.now();
    this.gameActive = false;
    this.gameState = null;
  }
}

class RoomManager {
  constructor() {
    this.rooms = new Map(); // roomId -> GameRoom
    this.maxRooms = 100; // Limit concurrent rooms
  }

  /**
   * Create a new room
   * @param {string} roomId - Room identifier
   * @param {object} host - Host player object
   * @returns {boolean} - Success status
   */
  createRoom(roomId, host) {
    if (this.rooms.has(roomId)) {
      return false;
    }
    
    if (this.rooms.size >= this.maxRooms) {
      return false;
    }
    
    const room = new GameRoom(roomId, host);
    this.rooms.set(roomId, room);
    return true;
  }

  /**
   * Get room by ID
   * @param {string} roomId - Room identifier
   * @returns {GameRoom|null} - Room object or null
   */
  getRoom(roomId) {
    return this.rooms.get(roomId) || null;
  }

  /**
   * Delete a room
   * @param {string} roomId - Room identifier
   * @returns {boolean} - Success status
   */
  deleteRoom(roomId) {
    return this.rooms.delete(roomId);
  }

  /**
   * Get all active rooms
   * @returns {Array} - Array of rooms
   */
  getAllRooms() {
    return Array.from(this.rooms.values());
  }

  /**
   * Get available rooms (not full, not in game)
   * @returns {Array} - Array of available rooms
   */
  getAvailableRooms() {
    return this.getAllRooms().filter(room => 
      room.players.length < 2 && !room.gameActive
    );
  }

  /**
   * Check if room is full
   * @param {string} roomId - Room identifier
   * @returns {boolean} - True if room is full
   */
  isRoomFull(roomId) {
    const room = this.getRoom(roomId);
    return room ? room.players.length >= 2 : true;
  }

  /**
   * Clean up old empty rooms
   * @param {number} maxAgeMs - Maximum age in milliseconds
   */
  cleanupEmptyRooms(maxAgeMs = 3600000) { // Default 1 hour
    const now = Date.now();
    this.rooms.forEach((room, roomId) => {
      if (room.players.length === 0 && now - room.createdAt > maxAgeMs) {
        this.rooms.delete(roomId);
      }
    });
  }
}

module.exports = { RoomManager, GameRoom };