export interface Participant {
  id: string;
  socketId: string;
  name: string;
  isHost: boolean;
  isAudioMuted: boolean;
  isVideoMuted: boolean;
  isScreenSharing: boolean;
  joinedAt: number;
}

export interface RoomState {
  id: string;
  name: string;
  hostId: string;
  temporaryPassword: string;
  createdAt: number;
  participants: Map<string, Participant>;
  maxParticipants: number;
  waitingQueue: Participant[];
  currentSpeakerId: string | null;
  screenSharingParticipantId: string | null;
  isRecording: boolean;
  recordingStartedAt: number | null;
}

export interface SignalingMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'join' | 'leave' | 'mute' | 'unmute' | 'screen-share-start' | 'screen-share-stop' | 'chat' | 'host-action';
  roomId: string;
  senderId: string;
  targetId?: string;
  data?: any;
  timestamp: number;
}

export interface ChatMessagePayload {
  content: string;
}

export interface HostActionPayload {
  action: 'mute-participant' | 'remove-participant' | 'start-recording' | 'stop-recording';
  targetParticipantId?: string;
}

export interface RoomStats {
  roomId: string;
  duration: number;
  averageBitrate: number;
  packetLossRate: number;
  activeParticipants: number;
  totalParticipants: number;
}

export interface Recording {
  id: string;
  roomId: string;
  startedAt: number;
  stoppedAt: number | null;
  duration: number | null;
  status: 'recording' | 'stopped' | 'failed';
  recordingUrl?: string;
}
