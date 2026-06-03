import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { Game } from './game';
import {
  TICK_RATE,
  ClientMessage,
  GameStateMessage,
  PlayerJoinedMessage,
  PlayerLeftMessage,
  GameStartMessage,
  GameOverMessage,
  ChatMessageBroadcast
} from '../shared/types';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, '..', 'dist', 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dist', 'public', 'index.html'));
});

interface PlayerConnection {
  ws: WebSocket;
  id: string;
  name: string;
}

interface GameWithMeta extends Game {
  gameOverSent: boolean;
}

const connections = new Map<string, PlayerConnection>();
const games = new Map<string, GameWithMeta>();

function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

function findOrCreateGame(): GameWithMeta {
  for (const game of games.values()) {
    if (game.gameStatus === 'waiting' && game.getPlayerCount() < 4) {
      return game;
    }
  }
  const gameId = generateId();
  const game = new Game() as GameWithMeta;
  game.gameOverSent = false;
  games.set(gameId, game);
  return game;
}

function sendToPlayer(playerId: string, message: any) {
  const conn = connections.get(playerId);
  if (conn && conn.ws.readyState === WebSocket.OPEN) {
    conn.ws.send(JSON.stringify(message));
  }
}

function broadcastToGame(game: Game, message: any, excludeId?: string) {
  for (const snake of game.snakes.values()) {
    if (snake.id !== excludeId) {
      sendToPlayer(snake.id, message);
    }
  }
  for (const specId of game.spectators) {
    if (specId !== excludeId) {
      sendToPlayer(specId, message);
    }
  }
}

function getPlayerGame(playerId: string): GameWithMeta | null {
  for (const game of games.values()) {
    if (game.snakes.has(playerId) || game.spectators.has(playerId)) {
      return game;
    }
  }
  return null;
}

wss.on('connection', (ws) => {
  const playerId = generateId();
  console.log(`Player connected: ${playerId}`);

  connections.set(playerId, {
    ws,
    id: playerId,
    name: ''
  });

  ws.on('message', (data) => {
    try {
      const message: ClientMessage = JSON.parse(data.toString());
      handleMessage(playerId, message);
    } catch (e) {
      console.error('Error parsing message:', e);
    }
  });

  ws.on('close', () => {
    console.log(`Player disconnected: ${playerId}`);
    handlePlayerLeave(playerId);
  });
});

function handleMessage(playerId: string, message: ClientMessage) {
  const conn = connections.get(playerId);
  if (!conn) return;

  switch (message.type) {
    case 'join':
      conn.name = message.name || 'Player';
      handlePlayerJoin(playerId, conn.name);
      break;

    case 'direction':
      const gameDir = getPlayerGame(playerId);
      if (gameDir) {
        gameDir.setDirection(playerId, message.direction);
      }
      break;

    case 'boost':
      const gameBoost = getPlayerGame(playerId);
      if (gameBoost) {
        gameBoost.setBoost(playerId, message.boosting);
      }
      break;

    case 'chat':
      const gameChat = getPlayerGame(playerId);
      if (gameChat) {
        const chatMsg: ChatMessageBroadcast = {
          type: 'chatMessage',
          sender: playerId,
          senderName: conn.name,
          text: message.text
        };
        broadcastToGame(gameChat, chatMsg);
      }
      break;

    case 'playAgain':
      const gameAgain = getPlayerGame(playerId);
      if (gameAgain && gameAgain.gameStatus === 'finished') {
        gameAgain.reset();
        gameAgain.gameOverSent = false;
        for (const snake of gameAgain.snakes.values()) {
          const joinMsg: PlayerJoinedMessage = {
            type: 'playerJoined',
            id: snake.id,
            name: snake.name,
            color: snake.color
          };
          broadcastToGame(gameAgain, joinMsg);
        }
        if (gameAgain.canStart()) {
          gameAgain.start();
          broadcastToGame(gameAgain, { type: 'gameStart' } as GameStartMessage);
        }
      }
      break;
  }
}

function handlePlayerJoin(playerId: string, name: string) {
  const game = findOrCreateGame();
  const isPlayer = game.addPlayer(playerId, name);

  const joinMsg: PlayerJoinedMessage = {
    type: 'playerJoined',
    id: playerId,
    name,
    color: game.snakes.get(playerId)?.color || '#888888'
  };
  broadcastToGame(game, joinMsg, playerId);

  for (const snake of game.snakes.values()) {
    if (snake.id !== playerId) {
      const existingJoinMsg: PlayerJoinedMessage = {
        type: 'playerJoined',
        id: snake.id,
        name: snake.name,
        color: snake.color
      };
      sendToPlayer(playerId, existingJoinMsg);
    }
  }

  if (game.canStart()) {
    game.start();
    broadcastToGame(game, { type: 'gameStart' } as GameStartMessage);
  }
}

function handlePlayerLeave(playerId: string) {
  const game = getPlayerGame(playerId);
  if (game) {
    game.removePlayer(playerId);
    const leaveMsg: PlayerLeftMessage = {
      type: 'playerLeft',
      id: playerId
    };
    broadcastToGame(game, leaveMsg);

    if (game.getPlayerCount() === 0) {
      for (const [gameId, g] of games.entries()) {
        if (g === game) {
          games.delete(gameId);
          break;
        }
      }
    }
  }
  connections.delete(playerId);
}

setInterval(() => {
  const tickInterval = 1000 / TICK_RATE;

  for (const game of games.values()) {
    if (game.gameStatus === 'playing') {
      game.tick(tickInterval / 1000);
    }

    const state = game.getState();
    const stats = game.getPlayerStats();

    for (const snake of game.snakes.values()) {
      const stateMsg: GameStateMessage = {
        type: 'gameState',
        state,
        playerId: snake.id,
        isSpectator: false,
        players: stats
      };
      sendToPlayer(snake.id, stateMsg);
    }

    for (const specId of game.spectators) {
      const stateMsg: GameStateMessage = {
        type: 'gameState',
        state,
        playerId: specId,
        isSpectator: true,
        players: stats
      };
      sendToPlayer(specId, stateMsg);
    }

    if (game.gameStatus === 'finished' && !game.gameOverSent) {
      game.gameOverSent = true;
      const gameOverMsg: GameOverMessage = {
        type: 'gameOver',
        stats
      };
      broadcastToGame(game, gameOverMsg);
    }
  }
}, 1000 / TICK_RATE);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
