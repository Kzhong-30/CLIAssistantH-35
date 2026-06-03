import React from 'react';
import { useGameWebSocket } from './hooks/useGameWebSocket';
import { GameCanvas } from './components/GameCanvas';
import { Leaderboard } from './components/Leaderboard';
import { ChatPanel } from './components/ChatPanel';
import { NameInputModal, WaitingModal, GameOverModal } from './components/Modals';

const App: React.FC = () => {
  const {
    gameState,
    playerId,
    isSpectator,
    playerStats,
    gameOver,
    gameOverStats,
    chatMessages,
    players,
    waitingForPlayers,
    connect,
    sendDirection,
    sendBoost,
    sendChat,
    playAgain
  } = useGameWebSocket();

  const [playerName, setPlayerName] = React.useState<string | null>(null);

  const handleNameSubmit = (name: string) => {
    setPlayerName(name);
    connect(name);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const mySnake = gameState?.snakes.find(s => s.id === playerId);
  const myScore = mySnake?.score || 0;
  const myLength = mySnake?.body.length || 0;

  const showWaiting = waitingForPlayers && !isSpectator && gameState?.gameStatus === 'waiting';

  return (
    <div className="app">
      {!playerName && <NameInputModal onSubmit={handleNameSubmit} />}
      
      {playerName && showWaiting && (
        <WaitingModal players={players} playerId={playerId} />
      )}
      
      {gameOver && (
        <GameOverModal
          stats={gameOverStats}
          playerId={playerId}
          onPlayAgain={playAgain}
        />
      )}

      <div className="game-container">
        <div className="game-wrapper">
          <div className="game-header">
            <div className="game-title">🐍 贪吃蛇对战</div>
            <div className="game-info">
              <div className="info-item">
                <span className="info-label">时间</span>
                <span className={`info-value ${gameState && gameState.timeLeft < 30 ? 'time-warning' : ''}`}>
                  {gameState ? formatTime(gameState.timeLeft) : '3:00'}
                </span>
              </div>
              {!isSpectator && (
                <>
                  <div className="info-item">
                    <span className="info-label">得分</span>
                    <span className="info-value">{myScore}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">长度</span>
                    <span className="info-value">{myLength}</span>
                  </div>
                </>
              )}
              {isSpectator && (
                <div className="info-item">
                  <span className="info-label">模式</span>
                  <span className="info-value" style={{ color: '#4ECDC4' }}>观战</span>
                </div>
              )}
            </div>
          </div>

          <GameCanvas
            gameState={gameState}
            playerId={playerId}
            isSpectator={isSpectator}
            onDirectionChange={sendDirection}
            onBoostChange={sendBoost}
          />
        </div>

        <div className="sidebar">
          <Leaderboard players={playerStats} playerId={playerId} />
          <ChatPanel
            messages={chatMessages}
            playerId={playerId}
            onSendMessage={sendChat}
            disabled={false}
          />
        </div>
      </div>
    </div>
  );
};

export default App;
