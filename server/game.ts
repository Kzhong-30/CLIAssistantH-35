import {
  GRID_WIDTH,
  GRID_HEIGHT,
  GAME_DURATION,
  Direction,
  Position,
  Snake,
  Food,
  Obstacle,
  GameState,
  PlayerStats,
  SNAKE_COLORS,
  SPEED_BOOST_COST
} from '../shared/types';

export class Game {
  snakes: Map<string, Snake> = new Map();
  foods: Food[] = [];
  obstacles: Obstacle[] = [];
  timeLeft: number = GAME_DURATION;
  gameStatus: 'waiting' | 'playing' | 'finished' = 'waiting';
  winner: string | null = null;
  spectators: Set<string> = new Set();
  private lastTickTime: number = 0;
  private colorIndex: number = 0;

  addPlayer(id: string, name: string): boolean {
    if (this.snakes.size >= 4) {
      this.spectators.add(id);
      return false;
    }

    const color = SNAKE_COLORS[this.colorIndex % SNAKE_COLORS.length];
    this.colorIndex++;

    const startPos = this.getStartPosition(this.snakes.size);
    const snake: Snake = {
      id,
      name,
      color,
      body: this.createSnakeBody(startPos),
      direction: 'right',
      nextDirection: 'right',
      score: 0,
      alive: true,
      boosting: false,
      kills: 0,
      survivalTime: 0
    };

    this.snakes.set(id, snake);
    return true;
  }

  private getStartPosition(index: number): Position {
    const positions = [
      { x: 5, y: 5 },
      { x: GRID_WIDTH - 6, y: GRID_HEIGHT - 6 },
      { x: 5, y: GRID_HEIGHT - 6 },
      { x: GRID_WIDTH - 6, y: 5 }
    ];
    return positions[index % positions.length];
  }

  private createSnakeBody(start: Position): Position[] {
    return [
      { x: start.x, y: start.y },
      { x: start.x - 1, y: start.y },
      { x: start.x - 2, y: start.y }
    ];
  }

  removePlayer(id: string): void {
    this.snakes.delete(id);
    this.spectators.delete(id);
  }

  setDirection(id: string, direction: Direction): void {
    const snake = this.snakes.get(id);
    if (!snake || !snake.alive) return;

    const opposites: Record<Direction, Direction> = {
      up: 'down',
      down: 'up',
      left: 'right',
      right: 'left'
    };

    if (opposites[direction] !== snake.direction) {
      snake.nextDirection = direction;
    }
  }

  setBoost(id: string, boosting: boolean): void {
    const snake = this.snakes.get(id);
    if (!snake || !snake.alive) return;
    snake.boosting = boosting;
  }

  start(): void {
    this.gameStatus = 'playing';
    this.timeLeft = GAME_DURATION;
    this.spawnFood();
    this.spawnFood();
    this.spawnFood();
    this.lastTickTime = Date.now();
  }

  reset(): void {
    this.snakes.forEach((snake, id) => {
      const startPos = this.getStartPosition(Array.from(this.snakes.keys()).indexOf(id));
      snake.body = this.createSnakeBody(startPos);
      snake.direction = 'right';
      snake.nextDirection = 'right';
      snake.score = 0;
      snake.alive = true;
      snake.boosting = false;
      snake.kills = 0;
      snake.survivalTime = 0;
    });
    this.foods = [];
    this.obstacles = [];
    this.gameStatus = 'waiting';
    this.winner = null;
  }

  private spawnFood(): void {
    let attempts = 0;
    while (attempts < 100) {
      const x = Math.floor(Math.random() * GRID_WIDTH);
      const y = Math.floor(Math.random() * GRID_HEIGHT);

      if (!this.isOccupied(x, y)) {
        this.foods.push({ x, y });
        return;
      }
      attempts++;
    }
  }

  private isOccupied(x: number, y: number): boolean {
    for (const snake of this.snakes.values()) {
      for (const segment of snake.body) {
        if (segment.x === x && segment.y === y) return true;
      }
    }
    for (const food of this.foods) {
      if (food.x === x && food.y === y) return true;
    }
    for (const obs of this.obstacles) {
      if (obs.x === x && obs.y === y) return true;
    }
    return false;
  }

  tick(deltaTime: number): void {
    if (this.gameStatus !== 'playing') return;

    this.timeLeft -= deltaTime;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.endGame();
      return;
    }

    for (const snake of this.snakes.values()) {
      if (snake.alive) {
        snake.survivalTime += deltaTime;
      }
    }

    for (const snake of this.snakes.values()) {
      if (snake.alive) {
        this.moveSnake(snake);
      }
    }

    for (const snake of this.snakes.values()) {
      if (snake.alive && snake.boosting) {
        this.moveSnake(snake);
      }
    }

    const aliveSnakes = Array.from(this.snakes.values()).filter(s => s.alive);
    if (aliveSnakes.length <= 1 && this.snakes.size >= 2) {
      this.winner = aliveSnakes[0]?.id || null;
      this.endGame();
    }
  }

  private moveSnake(snake: Snake): void {
    snake.direction = snake.nextDirection;

    const head = snake.body[0];
    let newHead: Position;

    switch (snake.direction) {
      case 'up':
        newHead = { x: head.x, y: head.y - 1 };
        break;
      case 'down':
        newHead = { x: head.x, y: head.y + 1 };
        break;
      case 'left':
        newHead = { x: head.x - 1, y: head.y };
        break;
      case 'right':
        newHead = { x: head.x + 1, y: head.y };
        break;
    }

    if (newHead.x < 0 || newHead.x >= GRID_WIDTH || newHead.y < 0 || newHead.y >= GRID_HEIGHT) {
      this.killSnake(snake);
      return;
    }

    for (const segment of snake.body.slice(0, -1)) {
      if (segment.x === newHead.x && segment.y === newHead.y) {
        this.killSnake(snake);
        return;
      }
    }

    for (const other of this.snakes.values()) {
      if (other.id === snake.id) continue;
      for (const segment of other.body) {
        if (segment.x === newHead.x && segment.y === newHead.y) {
          if (other.alive) {
            other.kills++;
          }
          this.killSnake(snake);
          return;
        }
      }
    }

    for (const obs of this.obstacles) {
      if (obs.x === newHead.x && obs.y === newHead.y) {
        this.killSnake(snake);
        return;
      }
    }

    snake.body.unshift(newHead);

    let ateFood = false;
    for (let i = this.foods.length - 1; i >= 0; i--) {
      if (this.foods[i].x === newHead.x && this.foods[i].y === newHead.y) {
        this.foods.splice(i, 1);
        snake.score += 10;
        ateFood = true;
        this.spawnFood();
        break;
      }
    }

    if (!ateFood) {
      snake.body.pop();
    }

    if (snake.boosting && snake.body.length > 3) {
      const removeCount = Math.ceil(snake.body.length * SPEED_BOOST_COST * 0.1);
      for (let i = 0; i < removeCount && snake.body.length > 3; i++) {
        snake.body.pop();
      }
    }
  }

  private killSnake(snake: Snake): void {
    snake.alive = false;
    for (const segment of snake.body) {
      this.obstacles.push({ x: segment.x, y: segment.y });
    }
  }

  private endGame(): void {
    this.gameStatus = 'finished';
  }

  getState(): GameState {
    return {
      snakes: Array.from(this.snakes.values()),
      foods: [...this.foods],
      obstacles: [...this.obstacles],
      timeLeft: this.timeLeft,
      gameStatus: this.gameStatus,
      winner: this.winner
    };
  }

  getPlayerStats(): PlayerStats[] {
    const stats: PlayerStats[] = Array.from(this.snakes.values()).map(snake => ({
      id: snake.id,
      name: snake.name,
      color: snake.color,
      score: snake.score,
      kills: snake.kills,
      survivalTime: snake.survivalTime,
      alive: snake.alive,
      rank: 0
    }));

    stats.sort((a, b) => {
      if (b.alive !== a.alive) return b.alive ? 1 : -1;
      if (b.score !== a.score) return b.score - a.score;
      return b.survivalTime - a.survivalTime;
    });

    stats.forEach((stat, index) => {
      stat.rank = index + 1;
    });

    return stats;
  }

  isSpectator(id: string): boolean {
    return this.spectators.has(id);
  }

  getPlayerCount(): number {
    return this.snakes.size;
  }

  canStart(): boolean {
    return this.snakes.size >= 2 && this.gameStatus === 'waiting';
  }
}
