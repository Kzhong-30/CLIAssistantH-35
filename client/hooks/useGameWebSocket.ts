import { useEffect, useRef, useState, useCallback } from 'react';
import {
  GameState,
  PlayerStats,
  ServerMessage,
  GameStateMessage,
  GameOverMessage,
  ChatMessageBroadcast,
  Direction,
  ClientMessage
} from '../shared/types';

interface ChatMessage {
  sender: string;
  senderName: string;
  text: string;
  timestamp: number;
}

interface PlayerInfo {
  id: string;
  name: string;
  color: string;
}

export function useGameWebSocket() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [isSpectator, setIsSpectator] = useState(false);
  const [playerStats, setPlayerStats] = useState<PlayerStats[]>([]);
  const [gameOver, setGameOver] = useState(false);
  const [gameOverStats, setGameOverStats] = useState<PlayerStats[]>([]);
  const [connected, setConnected] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [waitingForPlayers, setWaitingForPlayers] = useState(true);
  const wsRef = useRef<WebSocket | null>(null);
  const nameRef = useRef<string>('');

  const connect = useCallback((name: string) => {
    nameRef.current = name;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onopen = () => {
      setConnected(true);
      sendMessage({ type: 'join', name });
    };

    ws.onmessage = (event) => {
      const message: ServerMessage = JSON.parse(event.data);
      handleMessage(message);
    };

    ws.onclose = () => {
      setConnected(false);
    };

    wsRef.current = ws;
  }, []);

  const handleMessage = (message: ServerMessage) => {
    switch (message.type) {
      case 'gameState':
        const stateMsg = message as GameStateMessage;
        setGameState(stateMsg.state);
        setPlayerId(stateMsg.playerId);
        setIsSpectator(stateMsg.isSpectator);
        setPlayerStats(stateMsg.players);
        if (stateMsg.state.gameStatus === 'waiting') {
          setWaitingForPlayers(true);
        } else {
          setWaitingForPlayers(false);
        }
        break;

      case 'playerJoined':
        setPlayers(prev => [...prev, { id: message.id, name: message.name, color: message.color }]);
        break;

      case 'playerLeft':
        setPlayers(prev => prev.filter(p => p.id !== message.id));
        break;

      case 'gameStart':
        setWaitingForPlayers(false);
        setGameOver(false);
        break;

      case 'gameOver':
        const overMsg = message as GameOverMessage;
        setGameOver(true);
        setGameOverStats(overMsg.stats);
        break;

      case 'chatMessage':
        const chatMsg = message as ChatMessageBroadcast;
        setChatMessages(prev => [...prev, {
          sender: chatMsg.sender,
          senderName: chatMsg.senderName,
          text: chatMsg.text,
          timestamp: Date.now()
        }]);
        break;
    }
  };

  const sendMessage = (message: ClientMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  };

  const sendDirection = useCallback((direction: Direction) => {
    sendMessage({ type: 'direction', direction });
  }, []);

  const sendBoost = useCallback((boosting: boolean) => {
    sendMessage({ type: 'boost', boosting });
  }, []);

  const sendChat = useCallback((text: string) => {
    sendMessage({ type: 'chat', text });
  }, []);

  const playAgain = useCallback(() => {
    sendMessage({ type: 'playAgain' });
    setGameOver(false);
  }, []);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
  }, []);

  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  return {
    gameState,
    playerId,
    isSpectator,
    playerStats,
    gameOver,
    gameOverStats,
    connected,
    chatMessages,
    players,
    waitingForPlayers,
    connect,
    sendDirection,
    sendBoost,
    sendChat,
    playAgain,
    disconnect
  };
}
