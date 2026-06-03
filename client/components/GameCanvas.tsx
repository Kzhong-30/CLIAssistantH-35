import React, { useEffect, useRef, useCallback } from 'react';
import {
  GameState,
  GRID_WIDTH,
  GRID_HEIGHT,
  Direction,
  Position,
  Snake,
  TICK_RATE
} from '../../shared/types';

interface GameCanvasProps {
  gameState: GameState | null;
  playerId: string | null;
  isSpectator: boolean;
  onDirectionChange: (direction: Direction) => void;
  onBoostChange: (boosting: boolean) => void;
}

const CELL_SIZE = 20;
const CANVAS_WIDTH = GRID_WIDTH * CELL_SIZE;
const CANVAS_HEIGHT = GRID_HEIGHT * CELL_SIZE;
const TICK_INTERVAL = 1000 / TICK_RATE;

function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function getNextPosition(head: Position, direction: Direction): Position {
  switch (direction) {
    case 'up': return { x: head.x, y: head.y - 1 };
    case 'down': return { x: head.x, y: head.y + 1 };
    case 'left': return { x: head.x - 1, y: head.y };
    case 'right': return { x: head.x + 1, y: head.y };
  }
}

function isValidDirection(current: Direction, next: Direction): boolean {
  const opposites: Record<Direction, Direction> = {
    up: 'down',
    down: 'up',
    left: 'right',
    right: 'left'
  };
  return opposites[current] !== next;
}

function applyPredictionTick(snake: Snake, pendingDirection: Direction | null): void {
  if (!snake.alive) return;

  if (pendingDirection && isValidDirection(snake.direction, pendingDirection)) {
    snake.direction = pendingDirection;
  }

  const steps = snake.boosting ? 2 : 1;

  for (let step = 0; step < steps; step++) {
    const head = snake.body[0];
    const newHead = getNextPosition(head, snake.direction);

    if (newHead.x < 0 || newHead.x >= GRID_WIDTH || newHead.y < 0 || newHead.y >= GRID_HEIGHT) {
      break;
    }

    snake.body.unshift(newHead);
    snake.body.pop();
  }
}

export const GameCanvas: React.FC<GameCanvasProps> = ({
  gameState,
  playerId,
  isSpectator,
  onDirectionChange,
  onBoostChange
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastDirectionRef = useRef<Direction>('right');
  const isBoostingRef = useRef(false);
  const predictedSnakeRef = useRef<Snake | null>(null);
  const lastServerStateRef = useRef<Snake | null>(null);
  const serverSnapshotTimeRef = useRef<number>(0);
  const pendingDirectionRef = useRef<Direction | null>(null);
  const animationFrameRef = useRef<number>();

  const predictSnakeMovement = useCallback(() => {
    if (!predictedSnakeRef.current || !predictedSnakeRef.current.alive) return null;

    const snapshot = JSON.parse(JSON.stringify(predictedSnakeRef.current));
    const now = Date.now();
    const elapsed = now - serverSnapshotTimeRef.current;
    const ticksElapsed = Math.floor(elapsed / TICK_INTERVAL);

    for (let i = 0; i < ticksElapsed; i++) {
      applyPredictionTick(snapshot, pendingDirectionRef.current);
      pendingDirectionRef.current = null;
    }

    return { snake: snapshot };
  }, []);

  const renderGame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#0f0f23';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= GRID_WIDTH; x++) {
      ctx.beginPath();
      ctx.moveTo(x * CELL_SIZE, 0);
      ctx.lineTo(x * CELL_SIZE, CANVAS_HEIGHT);
      ctx.stroke();
    }
    for (let y = 0; y <= GRID_HEIGHT; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * CELL_SIZE);
      ctx.lineTo(CANVAS_WIDTH, y * CELL_SIZE);
      ctx.stroke();
    }

    if (!gameState) {
      animationFrameRef.current = requestAnimationFrame(renderGame);
      return;
    }

    for (const obs of gameState.obstacles) {
      ctx.fillStyle = 'rgba(100, 100, 100, 0.6)';
      ctx.fillRect(
        obs.x * CELL_SIZE + 1,
        obs.y * CELL_SIZE + 1,
        CELL_SIZE - 2,
        CELL_SIZE - 2
      );
    }

    for (const food of gameState.foods) {
      const gradient = ctx.createRadialGradient(
        food.x * CELL_SIZE + CELL_SIZE / 2,
        food.y * CELL_SIZE + CELL_SIZE / 2,
        0,
        food.x * CELL_SIZE + CELL_SIZE / 2,
        food.y * CELL_SIZE + CELL_SIZE / 2,
        CELL_SIZE / 2
      );
      gradient.addColorStop(0, '#FF6B6B');
      gradient.addColorStop(1, '#C0392B');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(
        food.x * CELL_SIZE + CELL_SIZE / 2,
        food.y * CELL_SIZE + CELL_SIZE / 2,
        CELL_SIZE / 2 - 2,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    const prediction = predictSnakeMovement();
    const predictedPlayerSnake = prediction?.snake;

    for (const snake of gameState.snakes) {
      if (!snake.alive) continue;

      const isPlayer = snake.id === playerId;
      const snakeToRender = (isPlayer && predictedPlayerSnake) ? predictedPlayerSnake : snake;
      const bodyLength = snakeToRender.body.length;

      snakeToRender.body.forEach((segment: Position, index: number) => {
        const progress = index / bodyLength;
        const alpha = 1 - progress * 0.4;

        if (index === 0) {
          ctx.fillStyle = snake.color;
          ctx.shadowColor = snake.color;
          ctx.shadowBlur = isPlayer ? 15 : 5;
          
          const x = segment.x * CELL_SIZE;
          const y = segment.y * CELL_SIZE;
          const size = CELL_SIZE - 2;
          const radius = 6;

          drawRoundRect(ctx, x + 1, y + 1, size, size, radius);
          ctx.fill();

          ctx.shadowBlur = 0;
          ctx.fillStyle = '#fff';
          
          let eyeOffsetX = 0, eyeOffsetY = 0;
          switch (snakeToRender.direction) {
            case 'up': eyeOffsetY = -3; break;
            case 'down': eyeOffsetY = 3; break;
            case 'left': eyeOffsetX = -3; break;
            case 'right': eyeOffsetX = 3; break;
          }

          ctx.beginPath();
          ctx.arc(x + CELL_SIZE / 2 - 4 + eyeOffsetX, y + CELL_SIZE / 2 - 2 + eyeOffsetY, 3, 0, Math.PI * 2);
          ctx.arc(x + CELL_SIZE / 2 + 4 + eyeOffsetX, y + CELL_SIZE / 2 - 2 + eyeOffsetY, 3, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#000';
          ctx.beginPath();
          ctx.arc(x + CELL_SIZE / 2 - 4 + eyeOffsetX * 1.5, y + CELL_SIZE / 2 - 2 + eyeOffsetY * 1.5, 1.5, 0, Math.PI * 2);
          ctx.arc(x + CELL_SIZE / 2 + 4 + eyeOffsetX * 1.5, y + CELL_SIZE / 2 - 2 + eyeOffsetY * 1.5, 1.5, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = snake.color;
          ctx.globalAlpha = alpha;
          
          const x = segment.x * CELL_SIZE + 2;
          const y = segment.y * CELL_SIZE + 2;
          const size = CELL_SIZE - 4;

          drawRoundRect(ctx, x, y, size, size, 4);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      });
    }

    animationFrameRef.current = requestAnimationFrame(renderGame);
  }, [gameState, playerId, predictSnakeMovement]);

  useEffect(() => {
    if (gameState && playerId && !isSpectator) {
      const serverSnake = gameState.snakes.find(s => s.id === playerId);
      if (serverSnake) {
        const snakeChanged = JSON.stringify(lastServerStateRef.current?.body) !== JSON.stringify(serverSnake.body);
        
        if (snakeChanged || !predictedSnakeRef.current) {
          predictedSnakeRef.current = JSON.parse(JSON.stringify(serverSnake));
          lastServerStateRef.current = JSON.parse(JSON.stringify(serverSnake));
          serverSnapshotTimeRef.current = Date.now();
          pendingDirectionRef.current = null;
        } else {
          predictedSnakeRef.current.boosting = serverSnake.boosting;
          if (pendingDirectionRef.current === null) {
            predictedSnakeRef.current.direction = serverSnake.direction;
          }
        }
      }
    }
  }, [gameState, playerId, isSpectator]);

  useEffect(() => {
    animationFrameRef.current = requestAnimationFrame(renderGame);
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [renderGame]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (isSpectator) return;

    let newDirection: Direction | null = null;

    switch (e.key) {
      case 'ArrowUp':
      case 'w':
      case 'W':
        newDirection = 'up';
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
        newDirection = 'down';
        break;
      case 'ArrowLeft':
      case 'a':
      case 'A':
        newDirection = 'left';
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        newDirection = 'right';
        break;
      case ' ':
        if (!isBoostingRef.current) {
          isBoostingRef.current = true;
          onBoostChange(true);
        }
        e.preventDefault();
        break;
    }

    if (newDirection && newDirection !== lastDirectionRef.current) {
      const currentDir = predictedSnakeRef.current?.direction || lastDirectionRef.current;
      if (isValidDirection(currentDir, newDirection)) {
        pendingDirectionRef.current = newDirection;
      }
      lastDirectionRef.current = newDirection;
      onDirectionChange(newDirection);
    }
  }, [isSpectator, onDirectionChange, onBoostChange]);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    if (e.key === ' ') {
      isBoostingRef.current = false;
      onBoostChange(false);
    }
  }, [onBoostChange]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  const playerSnake = gameState?.snakes.find(s => s.id === playerId);
  const isBoosting = playerSnake?.boosting || false;

  return (
    <div className="canvas-wrapper" tabIndex={0}>
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
      />
      {isSpectator && (
        <div className="spectator-badge">
          <span>观战模式</span>
        </div>
      )}
      <div className={`boost-indicator ${isBoosting ? 'active' : ''}`}>
        ⚡ 加速中
      </div>
    </div>
  );
};
