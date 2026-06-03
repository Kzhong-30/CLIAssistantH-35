export const GRID_WIDTH = 40;
export const GRID_HEIGHT = 30;
export const GAME_DURATION = 180;
export const TICK_RATE = 10;
export const SPEED_BOOST_COST = 0.3;

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface Position {
  x: number;
  y: number;
}

export interface Snake {
  id: string;
  name: string;
  color: string;
  body: Position[];
  direction: Direction;
  nextDirection: Direction;
  score: number;
  alive: boolean;
  boosting: boolean;
  kills: number;
  survivalTime: number;
}

export interface Food {
  x: number;
  y: number;
}

export interface Obstacle {
  x: number;
  y: number;
}

export interface GameState {
  snakes: Snake[];
  foods: Food[];
  obstacles: Obstacle[];
  timeLeft: number;
  gameStatus: 'waiting' | 'playing' | 'finished';
  winner: string | null;
}

export interface PlayerStats {
  id: string;
  name: string;
  color: string;
  score: number;
  kills: number;
  survivalTime: number;
  alive: boolean;
  rank: number;
}

export type MessageType = 
  | 'join'
  | 'leave'
  | 'direction'
  | 'boost'
  | 'chat'
  | 'gameState'
  | 'playerJoined'
  | 'playerLeft'
  | 'gameStart'
  | 'gameOver'
  | 'chatMessage'
  | 'spectator'
  | 'playAgain';

export interface BaseMessage {
  type: MessageType;
}

export interface JoinMessage extends BaseMessage {
  type: 'join';
  name: string;
}

export interface DirectionMessage extends BaseMessage {
  type: 'direction';
  direction: Direction;
}

export interface BoostMessage extends BaseMessage {
  type: 'boost';
  boosting: boolean;
}

export interface ChatMessage extends BaseMessage {
  type: 'chat';
  text: string;
}

export interface GameStateMessage extends BaseMessage {
  type: 'gameState';
  state: GameState;
  playerId: string;
  isSpectator: boolean;
  players: PlayerStats[];
}

export interface PlayerJoinedMessage extends BaseMessage {
  type: 'playerJoined';
  id: string;
  name: string;
  color: string;
}

export interface PlayerLeftMessage extends BaseMessage {
  type: 'playerLeft';
  id: string;
}

export interface GameStartMessage extends BaseMessage {
  type: 'gameStart';
}

export interface GameOverMessage extends BaseMessage {
  type: 'gameOver';
  stats: PlayerStats[];
}

export interface ChatMessageBroadcast extends BaseMessage {
  type: 'chatMessage';
  sender: string;
  senderName: string;
  text: string;
}

export interface PlayAgainMessage extends BaseMessage {
  type: 'playAgain';
}

export type ClientMessage = 
  | JoinMessage
  | DirectionMessage
  | BoostMessage
  | ChatMessage
  | PlayAgainMessage;

export type ServerMessage = 
  | GameStateMessage
  | PlayerJoinedMessage
  | PlayerLeftMessage
  | GameStartMessage
  | GameOverMessage
  | ChatMessageBroadcast;

export const SNAKE_COLORS = [
  '#FF6B6B',
  '#4ECDC4',
  '#45B7D1',
  '#96CEB4',
  '#FFEAA7',
  '#DDA0DD',
  '#FF8C42',
  '#6C5CE7'
];
