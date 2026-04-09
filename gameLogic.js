/**
 * Game Logic Handler
 * Manages game state, physics, collisions, and scoring
 */

class GameLogic {
  constructor() {
    this.canvasWidth = 800;
    this.canvasHeight = 600;
    this.bulletId = 0;
    this.enemyId = 0;
    this.powerupId = 0;
  }

  /**
   * Initialize game state for a room
   * @param {Array} players - Array of player objects
   * @returns {object} - Initial game state
   */
  initializeGame(players) {
    const gameState = {
      players: {},
      enemies: [],
      bullets: [],
      powerups: [],
      scores: {},
      difficulty: 'EASY',
      enemySpawnTimer: 0,
      waveNumber: 1,
      gameTime: 0
    };

    // Initialize players
    players.forEach((player, index) => {
      gameState.players[player.clientId] = {
        id: player.clientId,
        name: player.name,
        x: this.canvasWidth * (index === 0 ? 0.25 : 0.75),
        y: this.canvasHeight - 50,
        lives: 3,
        score: 0,
        powerupActive: false,
        powerupEndTime: 0,
        width: 30,
        height: 30
      };
      gameState.scores[player.clientId] = 0;
    });

    return gameState;
  }

  /**
   * Create a new bullet
   * @param {string} playerId - Player who fired
   * @param {number} x - X position
   * @param {number} y - Y position
   * @returns {object} - Bullet object
   */
  createBullet(playerId, x, y) {
    return {
      id: this.bulletId++,
      playerId: playerId,
      x: x,
      y: y,
      width: 4,
      height: 10,
      speed: 8,
      damage: 1
    };
  }

  /**
   * Create a new enemy based on difficulty
   * @param {string} difficulty - Current difficulty level
   * @returns {object} - Enemy object
   */
  createEnemy(difficulty) {
    const enemyTypes = this.getEnemyTypesForDifficulty(difficulty);
    const type = enemyTypes[Math.floor(Math.random() * enemyTypes.length)];
    
    let health, speed, color, score;
    
    switch(type) {
      case 1:
        health = 1;
        speed = 2;
        color = '#FF4444';
        score = 10;
        break;
      case 2:
        health = 2;
        speed = 1.5;
        color = '#FF8844';
        score = 20;
        break;
      case 3:
        health = 2;
        speed = 3;
        color = '#FF44FF';
        score = 30;
        break;
      default:
        health = 1;
        speed = 2;
        color = '#FF4444';
        score = 10;
    }
    
    return {
      id: this.enemyId++,
      type: type,
      x: Math.random() * (this.canvasWidth - 40) + 20,
      y: -20,
      health: health,
      maxHealth: health,
      width: 30,
      height: 30,
      speed: speed,
      color: color,
      scoreValue: score
    };
  }

  /**
   * Get enemy types available for current difficulty
   * @param {string} difficulty - Difficulty level
   * @returns {Array} - Array of enemy types
   */
  getEnemyTypesForDifficulty(difficulty) {
    switch(difficulty) {
      case 'EASY':
        return [1];
      case 'MEDIUM':
        return [1, 2];
      case 'HARD':
        return [1, 2, 3];
      default:
        return [1];
    }
  }

  /**
   * Create a power-up
   * @param {number} x - X position
   * @param {number} y - Y position
   * @returns {object} - Power-up object
   */
  createPowerup(x, y) {
    return {
      id: this.powerupId++,
      x: x,
      y: y,
      type: 'double_bullet',
      width: 20,
      height: 20,
      duration: 10000, // 10 seconds
      active: true
    };
  }

  /**
   * Update game state
   * @param {object} gameState - Current game state
   * @returns {boolean} - True if state was updated
   */
  updateGame(gameState) {
    if (!gameState) return false;
    
    gameState.gameTime++;
    
    // Update bullets
    this.updateBullets(gameState);
    
    // Update enemies
    this.updateEnemies(gameState);
    
    // Update powerups
    this.updatePowerups(gameState);
    
    // Spawn enemies based on difficulty
    this.spawnEnemies(gameState);
    
    // Check collisions
    this.checkCollisions(gameState);
    
    // Update difficulty based on score/wave
    this.updateDifficulty(gameState);
    
    // Update powerup timers
    this.updatePowerupTimers(gameState);
    
    return true;
  }

  /**
   * Update bullet positions
   * @param {object} gameState - Game state
   */
  updateBullets(gameState) {
    for (let i = 0; i < gameState.bullets.length; i++) {
      const bullet = gameState.bullets[i];
      bullet.y -= bullet.speed;
      
      // Remove bullets that are off screen
      if (bullet.y + bullet.height < 0 || bullet.y > this.canvasHeight) {
        gameState.bullets.splice(i, 1);
        i--;
      }
    }
  }

  /**
   * Update enemy positions
   * @param {object} gameState - Game state
   */
  updateEnemies(gameState) {
    for (let i = 0; i < gameState.enemies.length; i++) {
      const enemy = gameState.enemies[i];
      enemy.y += enemy.speed;
      
      // Remove enemies that are off screen
      if (enemy.y > this.canvasHeight + 50) {
        gameState.enemies.splice(i, 1);
        i--;
      }
    }
  }

  /**
   * Update powerup positions
   * @param {object} gameState - Game state
   */
  updatePowerups(gameState) {
    for (let i = 0; i < gameState.powerups.length; i++) {
      const powerup = gameState.powerups[i];
      powerup.y += 2;
      
      // Remove powerups that are off screen
      if (powerup.y > this.canvasHeight + 50) {
        gameState.powerups.splice(i, 1);
        i--;
      }
    }
  }

  /**
   * Spawn enemies based on difficulty and wave
   * @param {object} gameState - Game state
   */
  spawnEnemies(gameState) {
    // Determine spawn delay based on difficulty
    let spawnDelay;
    switch(gameState.difficulty) {
      case 'EASY':
        spawnDelay = 60;
        break;
      case 'MEDIUM':
        spawnDelay = 45;
        break;
      case 'HARD':
        spawnDelay = 30;
        break;
      default:
        spawnDelay = 60;
    }
    
    if (gameState.enemySpawnTimer <= 0) {
      // Spawn 1-3 enemies based on difficulty
      const enemyCount = Math.min(
        Math.floor(Math.random() * 3) + 1,
        this.getMaxEnemiesForDifficulty(gameState.difficulty)
      );
      
      for (let i = 0; i < enemyCount; i++) {
        if (gameState.enemies.length < 20) { // Limit max enemies
          gameState.enemies.push(this.createEnemy(gameState.difficulty));
        }
      }
      
      gameState.enemySpawnTimer = spawnDelay;
    } else {
      gameState.enemySpawnTimer--;
    }
  }

  /**
   * Get maximum enemies based on difficulty
   * @param {string} difficulty - Difficulty level
   * @returns {number} - Maximum enemies
   */
  getMaxEnemiesForDifficulty(difficulty) {
    switch(difficulty) {
      case 'EASY': return 8;
      case 'MEDIUM': return 12;
      case 'HARD': return 15;
      default: return 8;
    }
  }

  /**
   * Check and handle all collisions
   * @param {object} gameState - Game state
   */
  checkCollisions(gameState) {
    // Bullet vs Enemy collisions
    for (let i = 0; i < gameState.bullets.length; i++) {
      const bullet = gameState.bullets[i];
      
      for (let j = 0; j < gameState.enemies.length; j++) {
        const enemy = gameState.enemies[j];
        
        if (this.checkCollision(bullet, enemy)) {
          // Apply damage to enemy
          enemy.health -= bullet.damage;
          
          // Remove bullet
          gameState.bullets.splice(i, 1);
          i--;
          
          // Check if enemy is destroyed
          if (enemy.health <= 0) {
            // Add score to player
            if (gameState.scores[bullet.playerId] !== undefined) {
              gameState.scores[bullet.playerId] += enemy.scoreValue;
              
              // Update player score in players object
              if (gameState.players[bullet.playerId]) {
                gameState.players[bullet.playerId].score += enemy.scoreValue;
              }
            }
            
            // Remove enemy
            gameState.enemies.splice(j, 1);
            
            // Chance to spawn power-up (40%)
            if (Math.random() < 0.4) {
              gameState.powerups.push(this.createPowerup(enemy.x, enemy.y));
            }
          }
          
          break;
        }
      }
    }
    
    // Player vs Enemy collisions
    for (const playerId in gameState.players) {
      const player = gameState.players[playerId];
      
      for (let i = 0; i < gameState.enemies.length; i++) {
        const enemy = gameState.enemies[i];
        
        if (this.checkCollision(player, enemy)) {
          // Player takes damage
          player.lives--;
          
          // Remove enemy
          gameState.enemies.splice(i, 1);
          i--;
          
          // Check if player died
          if (player.lives <= 0) {
            player.lives = 0;
          }
          
          break;
        }
      }
    }
    
    // Player vs Powerup collisions
    for (const playerId in gameState.players) {
      const player = gameState.players[playerId];
      
      for (let i = 0; i < gameState.powerups.length; i++) {
        const powerup = gameState.powerups[i];
        
        if (this.checkCollision(player, powerup)) {
          // Activate powerup for player
          player.powerupActive = true;
          player.powerupEndTime = Date.now() + powerup.duration;
          
          // Remove powerup
          gameState.powerups.splice(i, 1);
          i--;
          
          break;
        }
      }
    }
  }

  /**
   * Check collision between two objects
   * @param {object} obj1 - First object with x,y,width,height
   * @param {object} obj2 - Second object with x,y,width,height
   * @returns {boolean} - True if colliding
   */
  checkCollision(obj1, obj2) {
    return obj1.x < obj2.x + obj2.width &&
           obj1.x + obj1.width > obj2.x &&
           obj1.y < obj2.y + obj2.height &&
           obj1.y + obj1.height > obj2.y;
  }

  /**
   * Update difficulty based on game progress
   * @param {object} gameState - Game state
   */
  updateDifficulty(gameState) {
    const totalScore = Object.values(gameState.scores).reduce((a, b) => a + b, 0);
    
    if (totalScore > 500 && gameState.difficulty === 'EASY') {
      gameState.difficulty = 'MEDIUM';
      gameState.waveNumber = 2;
    } else if (totalScore > 1000 && gameState.difficulty === 'MEDIUM') {
      gameState.difficulty = 'HARD';
      gameState.waveNumber = 3;
    }
  }

  /**
   * Update powerup timers for players
   * @param {object} gameState - Game state
   */
  updatePowerupTimers(gameState) {
    const now = Date.now();
    
    for (const playerId in gameState.players) {
      const player = gameState.players[playerId];
      
      if (player.powerupActive && now > player.powerupEndTime) {
        player.powerupActive = false;
      }
    }
  }

  /**
   * Check if game is over
   * @param {object} gameState - Game state
   * @returns {boolean} - True if game is over
   */
  isGameOver(gameState) {
    let alivePlayers = 0;
    
    for (const playerId in gameState.players) {
      if (gameState.players[playerId].lives > 0) {
        alivePlayers++;
      }
    }
    
    return alivePlayers === 0;
  }

  /**
   * Get winner of the game
   * @param {object} gameState - Game state
   * @returns {object|null} - Winner player object or null
   */
  getWinner(gameState) {
    let winner = null;
    let highestScore = -1;
    
    for (const playerId in gameState.players) {
      const player = gameState.players[playerId];
      if (player.score > highestScore) {
        highestScore = player.score;
        winner = player;
      }
    }
    
    return winner;
  }
}

module.exports = { GameLogic };