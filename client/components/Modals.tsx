import React from 'react';
import { PlayerStats, PlayerInfo } from '../../shared/types';

interface NameInputModalProps {
  onSubmit: (name: string) => void;
}

export const NameInputModal: React.FC<NameInputModalProps> = ({ onSubmit }) => {
  const [name, setName] = React.useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onSubmit(name.trim());
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h1 className="modal-title">🐍 贪吃蛇对战</h1>
        <p className="modal-subtitle">多人实时对战 · 吃掉食物 · 消灭对手</p>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="输入你的昵称"
            className="modal-input"
            maxLength={12}
            autoFocus
          />
          <button
            type="submit"
            className="modal-btn"
            disabled={!name.trim()}
          >
            开始游戏
          </button>
        </form>
      </div>
    </div>
  );
};

interface WaitingModalProps {
  players: PlayerInfo[];
  playerId: string | null;
}

export const WaitingModal: React.FC<WaitingModalProps> = ({ players, playerId }) => {
  return (
    <div className="modal-overlay">
      <div className="modal">
        <h1 className="modal-title">匹配中</h1>
        <p className="waiting-text">
          正在等待其他玩家<span className="waiting-dots"></span>
        </p>
        <div className="player-list">
          {players.map((player) => (
            <div key={player.id} className="player-list-item">
              <div
                className="player-color"
                style={{ backgroundColor: player.color }}
              />
              <span>{player.name}</span>
              {player.id === playerId && <span style={{ color: '#4ECDC4' }}> (你)</span>}
            </div>
          ))}
        </div>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px' }}>
          {players.length}/4 名玩家 · 满2人自动开始
        </p>
      </div>
    </div>
  );
};

interface GameOverModalProps {
  stats: PlayerStats[];
  playerId: string | null;
  onPlayAgain: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  stats,
  playerId,
  onPlayAgain
}) => {
  const myStats = stats.find(s => s.id === playerId);
  const winner = stats.find(s => s.rank === 1);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h1 className="modal-title">
          {myStats?.rank === 1 ? '🎉 胜利!' : '游戏结束'}
        </h1>
        {winner && (
          <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '20px' }}>
            {winner.name} 获得胜利!
          </p>
        )}
        
        {myStats && (
          <div className="gameover-stats">
            <div className="stats-row">
              <div className="stat-item">
                <div className="stat-value">#{myStats.rank}</div>
                <div className="stat-label">排名</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{myStats.score}</div>
                <div className="stat-label">得分</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{myStats.kills}</div>
                <div className="stat-label">击杀</div>
              </div>
            </div>
          </div>
        )}

        <table className="stats-table">
          <thead>
            <tr>
              <th>排名</th>
              <th>玩家</th>
              <th>得分</th>
              <th>击杀</th>
              <th>存活</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((stat) => (
              <tr key={stat.id} className={stat.id === playerId ? 'you' : ''}>
                <td>
                  <span style={{ fontWeight: 'bold' }}>#{stat.rank}</span>
                  {stat.rank === 1 && <span className="winner-badge">WIN</span>}
                </td>
                <td>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        width: '10px',
                        height: '10px',
                        backgroundColor: stat.color,
                        borderRadius: '2px'
                      }}
                    />
                    {stat.name}
                    {stat.id === playerId && ' (你)'}
                  </span>
                </td>
                <td style={{ fontWeight: 'bold', color: '#4ECDC4' }}>{stat.score}</td>
                <td>{stat.kills}</td>
                <td>{formatTime(stat.survivalTime)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <button
          className="modal-btn"
          style={{ marginTop: '25px' }}
          onClick={onPlayAgain}
        >
          再来一局
        </button>
      </div>
    </div>
  );
};
