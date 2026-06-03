import React from 'react';
import { PlayerStats } from '../../shared/types';

interface LeaderboardProps {
  players: PlayerStats[];
  playerId: string | null;
}

export const Leaderboard: React.FC<LeaderboardProps> = ({ players, playerId }) => {
  const getRankClass = (rank: number) => {
    if (rank === 1) return 'rank-1';
    if (rank === 2) return 'rank-2';
    if (rank === 3) return 'rank-3';
    return '';
  };

  return (
    <div className="panel">
      <div className="panel-title">排行榜</div>
      <div className="leaderboard-list">
        {players.map((player) => (
          <div
            key={player.id}
            className={`leaderboard-item ${player.id === playerId ? 'you' : ''} ${!player.alive ? 'dead' : ''}`}
          >
            <div className={`rank-badge ${getRankClass(player.rank)}`}>
              {player.rank}
            </div>
            <div
              className="player-color"
              style={{ backgroundColor: player.color }}
            />
            <div className="player-name">
              {player.name}
              {player.id === playerId && ' (你)'}
            </div>
            <div className="player-score">{player.score}</div>
          </div>
        ))}
        {players.length === 0 && (
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px', textAlign: 'center', padding: '10px' }}>
            等待玩家加入...
          </div>
        )}
      </div>
    </div>
  );
};
