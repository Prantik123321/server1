/**
 * Space Shooter Multiplayer Server
 * Optimized for Render.com hosting
 * Supports WebSocket connections on free tier
 */

const WebSocket = require('ws');
const express = require('express');
const http = require('http');
const path = require('path');
const { RoomManager } = require('./rooms');
const { GameLogic } = require('./gameLogic');
const { generateRoomId } = require('./utils');

// Configuration - Render.com sets PORT environment variable
const PORT = process.env.PORT || 8080;
const HOST = '0.0.0.0';
const HEARTBEAT_INTERVAL = 30000;
const CLEANUP_INTERVAL = 300000; // 5 minutes

// Initialize Express
const app = express();
const server = http.createServer(app);

// WebSocket server with upgrade handling for Render.com
const wss = new WebSocket.Server({ 
  server,
  // Handle connection upgrades properly
  handleProtocols: (protocols, request) => {
    return protocols[0] || 'ws';
  }
});

// Game managers
const roomManager = new RoomManager();
const gameLogic = new GameLogic();

// Store connected clients
const clients = new Map();

// Track server start time
const startTime = Date.now();

// Generate unique client ID
function generateClientId() {
  return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Broadcast to all players in room
function broadcastToRoom(roomId, message, excludeClientId = null) {
  const room = roomManager.getRoom(roomId);
  if (!room) return;

  room.players.forEach(player => {
    if (excludeClientId !== player.clientId) {
      const client = clients.get(player.clientId);
      if (client && client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.send(JSON.stringify(message));
        } catch (error) {
          console.error(`Broadcast error: ${error.message}`);
        }
      }
    }
  });
}

// Handle WebSocket connections
wss.on('connection', (ws, req) => {
  const clientId = generateClientId();
  const clientInfo = {
    ws,
    playerId: null,
    roomId: null,
    lastHeartbeat: Date.now(),
    ip: req.socket.remoteAddress
  };
  
  clients.set(clientId, clientInfo);
  console.log(`[${new Date().toISOString()}] Client connected: ${clientId} from ${clientInfo.ip}`);

  // Send initial connection confirmation
  ws.send(JSON.stringify({
    type: 'connected',
    clientId: clientId,
    message: 'Connected to Space Shooter Server',
    timestamp: Date.now(),
    serverTime: new Date().toISOString()
  }));

  // Handle incoming messages
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      handleMessage(clientId, message);
    } catch (error) {
      console.error(`Error parsing message from ${clientId}:`, error.message);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format'
      }));
    }
  });

  // Handle heartbeat with pong response
  ws.on('pong', () => {
    clientInfo.lastHeartbeat = Date.now();
  });

  // Handle disconnection
  ws.on('close', (code, reason) => {
    console.log(`[${new Date().toISOString()}] Client disconnected: ${clientId}, code: ${code}`);
    handleDisconnect(clientId);
    clients.delete(clientId);
  });
  
  // Handle errors
  ws.on('error', (error) => {
    console.error(`WebSocket error for ${clientId}:`, error.message);
    handleDisconnect(clientId);
    clients.delete(clientId);
  });
  
  // Send periodic heartbeat ping
  const heartbeatInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    } else {
      clearInterval(heartbeatInterval);
    }
  }, HEARTBEAT_INTERVAL);
  
  // Store interval ID for cleanup
  clientInfo.heartbeatInterval = heartbeatInterval;
});

// Message handler
function handleMessage(clientId, message) {
  const client = clients.get(clientId);
  if (!client) return;

  switch (message.type) {
    case 'create_room':
      handleCreateRoom(clientId, message);
      break;
    case 'join_room':
      handleJoinRoom(clientId, message);
      break;
    case 'start_game':
      handleStartGame(clientId, message);
      break;
    case 'player_move':
      handlePlayerMove(clientId, message);
      break;
    case 'player_shoot':
      handlePlayerShoot(clientId, message);
      break;
    case 'leave_room':
      handleLeaveRoom(clientId);
      break;
    case 'get_rooms':
      handleGetRooms(clientId);
      break;
    case 'heartbeat':
      client.lastHeartbeat = Date.now();
      client.ws.send(JSON.stringify({ type: 'heartbeat_ack', timestamp: Date.now() }));
      break;
    default:
      console.log(`Unknown message type: ${message.type}`);
  }
}

// Handle room creation
function handleCreateRoom(clientId, message) {
  const client = clients.get(clientId);
  if (!client) return;

  const roomId = message.roomId || generateRoomId();
  const playerName = message.playerName || `Player_${Math.floor(Math.random() * 1000)}`;
  
  // Create player object
  const player = {
    clientId: clientId,
    playerId: clientId,
    name: playerName,
    isHost: true,
    ready: false,
    joinedAt: Date.now()
  };
  
  // Create room
  const success = roomManager.createRoom(roomId, player);
  
  if (success) {
    client.roomId = roomId;
    client.playerId = clientId;
    
    // Send room created confirmation
    client.ws.send(JSON.stringify({
      type: 'room_created',
      roomId: roomId,
      playerId: clientId,
      playerName: playerName,
      isHost: true,
      roomCode: roomId
    }));
    
    // Send current player list
    sendRoomUpdate(roomId);
    console.log(`Room created: ${roomId} by ${clientId}`);
  } else {
    client.ws.send(JSON.stringify({
      type: 'error',
      message: 'Failed to create room. Room might already exist or server is full.'
    }));
  }
}

// Handle joining room
function handleJoinRoom(clientId, message) {
  const client = clients.get(clientId);
  if (!client) return;
  
  const { roomId, playerName } = message;
  const room = roomManager.getRoom(roomId);
  
  if (!room) {
    client.ws.send(JSON.stringify({
      type: 'error',
      message: 'Room not found. Please check the room code.'
    }));
    return;
  }
  
  if (room.players.length >= 2) {
    client.ws.send(JSON.stringify({
      type: 'error',
      message: 'Room is full. Max 2 players allowed.'
    }));
    return;
  }
  
  if (room.gameActive) {
    client.ws.send(JSON.stringify({
      type: 'error',
      message: 'Game already in progress. Please wait for it to end.'
    }));
    return;
  }
  
  // Add player to room
  const player = {
    clientId: clientId,
    playerId: clientId,
    name: playerName || `Player_${Math.floor(Math.random() * 1000)}`,
    isHost: false,
    ready: false,
    joinedAt: Date.now()
  };
  
  room.players.push(player);
  client.roomId = roomId;
  client.playerId = clientId;
  
  // Send join confirmation
  client.ws.send(JSON.stringify({
    type: 'room_joined',
    roomId: roomId,
    playerId: clientId,
    playerName: player.name,
    isHost: false,
    players: room.players.map(p => ({ 
      id: p.playerId, 
      name: p.name, 
      isHost: p.isHost,
      ready: p.ready
    }))
  }));
  
  // Notify other players
  broadcastToRoom(roomId, {
    type: 'player_joined',
    player: { 
      id: player.playerId, 
      name: player.name, 
      isHost: player.isHost,
      ready: player.ready
    }
  }, clientId);
  
  sendRoomUpdate(roomId);
  console.log(`Player ${player.name} (${clientId}) joined room ${roomId}`);
}

// Handle game start
function handleStartGame(clientId, message) {
  const client = clients.get(clientId);
  if (!client || !client.roomId) return;
  
  const room = roomManager.getRoom(client.roomId);
  if (!room) return;
  
  // Check if client is host
  const player = room.players.find(p => p.clientId === clientId);
  if (!player || !player.isHost) {
    client.ws.send(JSON.stringify({
      type: 'error',
      message: 'Only the host can start the game'
    }));
    return;
  }
  
  // Check if we have 2 players
  if (room.players.length < 2) {
    client.ws.send(JSON.stringify({
      type: 'error',
      message: 'Need 2 players to start the game. Wait for someone to join.'
    }));
    return;
  }
  
  // Initialize game
  const gameState = gameLogic.initializeGame(room.players);
  room.gameState = gameState;
  room.gameActive = true;
  room.gameStartTime = Date.now();
  
  // Notify all players
  broadcastToRoom(client.roomId, {
    type: 'game_started',
    players: room.players.map(p => ({
      id: p.playerId,
      name: p.name,
      lives: 3,
      score: 0
    })),
    timestamp: Date.now(),
    startTime: room.gameStartTime
  });
  
  console.log(`Game started in room ${client.roomId} with players: ${room.players.map(p => p.name).join(', ')}`);
}

// Handle player movement
function handlePlayerMove(clientId, message) {
  const client = clients.get(clientId);
  if (!client || !client.roomId) return;
  
  const room = roomManager.getRoom(client.roomId);
  if (!room || !room.gameActive) return;
  
  // Validate position
  const x = Math.max(0, Math.min(800, message.x));
  const y = Math.max(0, Math.min(600, message.y));
  
  // Update player position
  if (room.gameState.players[clientId]) {
    room.gameState.players[clientId].x = x;
    room.gameState.players[clientId].y = y;
  }
  
  // Broadcast movement to other player only (optimization)
  broadcastToRoom(client.roomId, {
    type: 'player_moved',
    playerId: clientId,
    x: x,
    y: y,
    timestamp: Date.now()
  }, clientId);
}

// Handle player shooting
function handlePlayerShoot(clientId, message) {
  const client = clients.get(clientId);
  if (!client || !client.roomId) return;
  
  const room = roomManager.getRoom(client.roomId);
  if (!room || !room.gameActive) return;
  
  // Check if player has powerup (double bullets)
  const player = room.gameState.players[clientId];
  const bulletCount = player && player.powerupActive ? 2 : 1;
  
  for (let i = 0; i < bulletCount; i++) {
    const offsetX = i === 0 ? 0 : (i === 1 ? 15 : -15);
    const bullet = gameLogic.createBullet(clientId, message.x + offsetX, message.y);
    room.gameState.bullets.push(bullet);
    
    // Broadcast to other player
    broadcastToRoom(client.roomId, {
      type: 'bullet_fired',
      playerId: clientId,
      bulletId: bullet.id,
      x: bullet.x,
      y: bullet.y,
      doubleShot: bulletCount > 1
    }, clientId);
  }
}

// Handle leaving room
function handleLeaveRoom(clientId) {
  const client = clients.get(clientId);
  if (!client || !client.roomId) return;
  
  const room = roomManager.getRoom(client.roomId);
  if (room) {
    const playerName = room.players.find(p => p.clientId === clientId)?.name || 'Unknown';
    
    // Remove player from room
    room.players = room.players.filter(p => p.clientId !== clientId);
    
    if (room.players.length === 0) {
      // Delete empty room
      roomManager.deleteRoom(client.roomId);
      console.log(`Room ${client.roomId} deleted (empty)`);
    } else {
      // Promote new host if needed
      if (room.players[0] && !room.players[0].isHost) {
        room.players[0].isHost = true;
        broadcastToRoom(client.roomId, {
          type: 'new_host',
          newHostId: room.players[0].clientId,
          newHostName: room.players[0].name
        });
      }
      
      broadcastToRoom(client.roomId, {
        type: 'player_left',
        playerId: clientId,
        playerName: playerName
      });
      
      sendRoomUpdate(client.roomId);
    }
  }
  
  client.roomId = null;
  client.playerId = null;
}

// Handle get rooms list
function handleGetRooms(clientId) {
  const client = clients.get(clientId);
  if (!client) return;
  
  const rooms = roomManager.getAvailableRooms();
  const roomList = rooms.map(room => ({
    id: room.id,
    playerCount: room.players.length,
    maxPlayers: 2,
    hasGame: room.gameActive || false,
    hostName: room.players[0]?.name || 'Unknown',
    createdAt: room.createdAt
  }));
  
  client.ws.send(JSON.stringify({
    type: 'rooms_list',
    rooms: roomList,
    count: roomList.length,
    timestamp: Date.now()
  }));
}

// Send room update to all players in room
function sendRoomUpdate(roomId) {
  const room = roomManager.getRoom(roomId);
  if (!room) return;
  
  broadcastToRoom(roomId, {
    type: 'room_update',
    players: room.players.map(p => ({ 
      id: p.playerId, 
      name: p.name, 
      isHost: p.isHost,
      ready: p.ready
    })),
    gameActive: room.gameActive || false,
    playerCount: room.players.length,
    maxPlayers: 2
  });
}

// Handle disconnection
function handleDisconnect(clientId) {
  const client = clients.get(clientId);
  if (client) {
    // Clear heartbeat interval
    if (client.heartbeatInterval) {
      clearInterval(client.heartbeatInterval);
    }
    
    // Leave room if in one
    if (client.roomId) {
      handleLeaveRoom(clientId);
    }
  }
  console.log(`Client ${clientId} disconnected and cleaned up`);
}

// Game loop (updates game state periodically)
let gameLoopInterval = null;

function startGameLoop() {
  if (gameLoopInterval) return;
  
  gameLoopInterval = setInterval(() => {
    // Update all active games
    roomManager.getAllRooms().forEach(room => {
      if (room.gameActive && room.gameState) {
        const updated = gameLogic.updateGame(room.gameState);
        
        // Send game state updates to players
        if (updated) {
          // Prepare minimal game state for network (reduce data size)
          const minimalState = {
            enemies: room.gameState.enemies.map(e => ({
              id: e.id,
              x: Math.floor(e.x),
              y: Math.floor(e.y),
              type: e.type,
              health: e.health
            })),
            bullets: room.gameState.bullets.map(b => ({
              id: b.id,
              x: Math.floor(b.x),
              y: Math.floor(b.y),
              playerId: b.playerId
            })),
            powerups: room.gameState.powerups.map(p => ({
              id: p.id,
              x: Math.floor(p.x),
              y: Math.floor(p.y),
              type: p.type
            })),
            players: Object.entries(room.gameState.players).map(([id, p]) => ({
              id: id,
              x: Math.floor(p.x),
              y: Math.floor(p.y),
              lives: p.lives,
              score: p.score,
              powerupActive: p.powerupActive
            })),
            difficulty: room.gameState.difficulty,
            timestamp: Date.now()
          };
          
          broadcastToRoom(room.id, {
            type: 'game_update',
            gameState: minimalState
          });
          
          // Check game over
          if (gameLogic.isGameOver(room.gameState)) {
            room.gameActive = false;
            const winner = gameLogic.getWinner(room.gameState);
            broadcastToRoom(room.id, {
              type: 'game_over',
              winner: winner ? {
                id: winner.id,
                name: winner.name,
                score: winner.score
              } : null,
              finalScores: room.gameState.scores,
              gameDuration: Date.now() - room.gameStartTime
            });
            
            // Schedule room cleanup after game ends
            setTimeout(() => {
              if (room && !room.gameActive) {
                roomManager.deleteRoom(room.id);
                console.log(`Room ${room.id} deleted after game completion`);
              }
            }, 60000); // Delete after 1 minute
          }
        }
      }
    });
  }, 1000 / 60); // 60 FPS game loop
}

// Start the game loop
startGameLoop();

// Periodic cleanup of empty rooms
setInterval(() => {
  const beforeCount = roomManager.getAllRooms().length;
  roomManager.cleanupEmptyRooms(1800000); // Clean rooms older than 30 minutes
  const afterCount = roomManager.getAllRooms().length;
  if (beforeCount !== afterCount) {
    console.log(`Cleanup completed: ${beforeCount} -> ${afterCount} rooms`);
  }
}, CLEANUP_INTERVAL);

// Express routes for health checks and monitoring
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    clients: clients.size,
    rooms: roomManager.getAllRooms().length,
    memory: process.memoryUsage(),
    version: '1.0.0'
  });
});

app.get('/stats', (req, res) => {
  res.json({
    activeRooms: roomManager.getAllRooms().length,
    connectedClients: clients.size,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    rooms: roomManager.getAllRooms().map(room => ({
      id: room.id,
      players: room.players.length,
      playerNames: room.players.map(p => p.name),
      gameActive: room.gameActive,
      createdAt: room.createdAt
    })),
    serverTime: Date.now(),
    nodeVersion: process.version
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Space Shooter Multiplayer Server',
    description: 'Real-time multiplayer space shooter game backend',
    version: '1.0.0',
    status: 'running',
    websocket: `wss://${req.headers.host}`,
    endpoints: ['/health', '/stats'],
    features: {
      maxPlayers: 2,
      maxRooms: 100,
      gameFPS: 60
    }
  });
});

// Handle 404
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Express error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
server.listen(PORT, HOST, () => {
  console.log(`========================================`);
  console.log(`🚀 Space Shooter Multiplayer Server`);
  console.log(`📡 Running on ${HOST}:${PORT}`);
  console.log(`🔗 WebSocket: ws://${HOST}:${PORT}`);
  console.log(`🔒 For production: wss://your-app.onrender.com`);
  console.log(`💚 Health check: http://${HOST}:${PORT}/health`);
  console.log(`📊 Stats: http://${HOST}:${PORT}/stats`);
  console.log(`💾 Memory usage: ${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`);
  console.log(`🕐 Uptime tracking started`);
  console.log(`========================================`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  
  // Close all WebSocket connections
  wss.clients.forEach((client) => {
    client.close();
  });
  
  server.close(() => {
    console.log('HTTP server closed');
    if (gameLoopInterval) {
      clearInterval(gameLoopInterval);
    }
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    if (gameLoopInterval) {
      clearInterval(gameLoopInterval);
    }
    process.exit(0);
  });
});