import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { nanoid } from 'nanoid';
import { Participant } from '../common/types';
import { RoomStateService } from '../services/room-state.service';
import { HistoryService } from '../services/history.service';

interface JoinRoomPayload {
  roomId: string;
  name: string;
  password?: string;
}

interface SignalingPayload {
  roomId: string;
  targetId: string;
  data: any;
}

interface ChatPayload {
  roomId: string;
  content: string;
}

interface HostActionPayload {
  roomId: string;
  action: 'mute-participant' | 'remove-participant';
  targetId: string;
}

@WebSocketGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  namespace: '/',
})
export class SignalingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(SignalingGateway.name);
  private readonly socketToParticipantMap = new Map<string, { roomId: string; participantId: string }>();

  constructor(
    private readonly roomStateService: RoomStateService,
    private readonly historyService: HistoryService,
  ) {}

  handleConnection(client: Socket): void {
    this.logger.log(`Client connected: ${client.id}`);
  }

  async handleDisconnect(client: Socket): Promise<void> {
    this.logger.log(`Client disconnected: ${client.id}`);
    const mapping = this.socketToParticipantMap.get(client.id);
    if (mapping) {
      await this.handleLeaveRoom(client, { roomId: mapping.roomId, silent: true });
      this.socketToParticipantMap.delete(client.id);
    }
  }

  @SubscribeMessage('join')
  async handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinRoomPayload,
  ): Promise<any> {
    const { roomId, name } = payload;

    const room = await this.roomStateService.getRoom(roomId);
    if (!room) {
      return this.sendError(client, 'join', 'Room not found');
    }

    const participantId = nanoid(8);

    const participantCount = await this.roomStateService.getParticipantCount(roomId);

    if (participantCount >= room.maxParticipants) {
      const waitingParticipant: Participant = {
        id: participantId,
        socketId: client.id,
        name,
        isHost: false,
        isAudioMuted: true,
        isVideoMuted: true,
        isScreenSharing: false,
        joinedAt: Date.now(),
      };

      const position = await this.roomStateService.addToWaitingQueue(roomId, waitingParticipant);
      this.socketToParticipantMap.set(client.id, { roomId, participantId });

      client.emit('waiting-queue', {
        roomId,
        position,
        estimatedWaitTime: position * 30,
        message: `Room is full. You are #${position} in the waiting queue.`,
      });

      return {
        event: 'join',
        data: {
          success: false,
          inQueue: true,
          position,
          participantId,
        },
      };
    }

    const isHost = participantCount === 0;

    const participant: Participant = {
      id: participantId,
      socketId: client.id,
      name,
      isHost,
      isAudioMuted: false,
      isVideoMuted: false,
      isScreenSharing: false,
      joinedAt: Date.now(),
    };

    if (isHost) {
      await this.roomStateService.updateRoomField(roomId, 'hostId', participantId);
    }

    await this.roomStateService.addParticipant(roomId, participant);
    await this.historyService.addParticipantHistory(participant, roomId);

    this.socketToParticipantMap.set(client.id, { roomId, participantId });
    client.join(roomId);

    const newCount = participantCount + 1;
    await this.roomStateService.incrementTotalParticipants(roomId, newCount);

    const otherParticipants: any[] = [];
    const allParticipants = await this.roomStateService.getParticipants(roomId);
    for (const [id, p] of allParticipants.entries()) {
      if (id !== participantId) {
        otherParticipants.push({
          id: p.id,
          name: p.name,
          isHost: p.isHost,
          isAudioMuted: p.isAudioMuted,
          isVideoMuted: p.isVideoMuted,
          isScreenSharing: p.isScreenSharing,
          joinedAt: p.joinedAt,
        });
      }
    }

    client.emit('joined', {
      roomId,
      participantId,
      isHost: participant.isHost,
      participants: otherParticipants,
      currentSpeakerId: room.currentSpeakerId,
      screenSharingParticipantId: room.screenSharingParticipantId,
      isRecording: room.isRecording,
    });

    client.to(roomId).emit('participant-joined', {
      participant: {
        id: participant.id,
        name: participant.name,
        isHost: participant.isHost,
        isAudioMuted: participant.isAudioMuted,
        isVideoMuted: participant.isVideoMuted,
        isScreenSharing: participant.isScreenSharing,
        joinedAt: participant.joinedAt,
      },
    });

    this.logger.log(`Participant ${name} (${participantId}) joined room ${roomId}`);

    return {
      event: 'join',
      data: {
        success: true,
        inQueue: false,
        participantId,
        isHost: participant.isHost,
      },
    };
  }

  @SubscribeMessage('leave')
  async handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string; silent?: boolean },
  ): Promise<any> {
    const { roomId, silent = false } = payload;
    const mapping = this.socketToParticipantMap.get(client.id);

    if (!mapping || mapping.roomId !== roomId) {
      if (!silent) {
        return this.sendError(client, 'leave', 'Not in this room');
      }
      return;
    }

    const participantId = mapping.participantId;
    const room = await this.roomStateService.getRoom(roomId);

    if (!room) {
      this.socketToParticipantMap.delete(client.id);
      return;
    }

    const removedParticipant = await this.roomStateService.removeParticipant(roomId, participantId);
    if (removedParticipant) {
      await this.historyService.updateParticipantOnLeave(
        participantId,
        removedParticipant.isAudioMuted,
        removedParticipant.isScreenSharing,
      );
    }

    await this.roomStateService.removeFromWaitingQueue(roomId, participantId);
    client.leave(roomId);
    this.socketToParticipantMap.delete(client.id);

    if (removedParticipant?.isScreenSharing) {
      await this.roomStateService.setScreenSharing(roomId, null);
      client.to(roomId).emit('screen-share-stopped', { participantId });
    }

    if (removedParticipant?.isHost) {
      const participants = await this.roomStateService.getParticipants(roomId);
      if (participants.size > 0) {
        const remaining = Array.from(participants.values());
        const newHost = remaining[0];
        newHost.isHost = true;
        await this.roomStateService.updateParticipant(roomId, newHost.id, { isHost: true });
        client.to(roomId).emit('host-changed', { newHostId: newHost.id });
      }
    }

    const remainingCount = await this.roomStateService.getParticipantCount(roomId);

    if (remainingCount < room.maxParticipants) {
      const nextInQueue = await this.roomStateService.getNextFromWaitingQueue(roomId);
      if (nextInQueue) {
        const newParticipant: Participant = {
          ...nextInQueue,
          isHost: remainingCount === 0,
          isAudioMuted: false,
          isVideoMuted: false,
        };
        await this.roomStateService.addParticipant(roomId, newParticipant);
        this.socketToParticipantMap.set(nextInQueue.socketId, {
          roomId,
          participantId: newParticipant.id,
        });

        const socket = this.server.sockets.sockets.get(nextInQueue.socketId);
        if (socket) {
          socket.join(roomId);
          socket.emit('queue-admitted', {
            roomId,
            participantId: newParticipant.id,
            isHost: newParticipant.isHost,
          });
        }

        this.logger.log(`Participant ${nextInQueue.name} admitted from queue to room ${roomId}`);
      }
    }

    if (remainingCount === 0) {
      const { total, peak } = await this.roomStateService.getRoomStats(roomId);
      await this.historyService.endRoomHistory(roomId, total, peak);
      await this.roomStateService.deleteRoom(roomId);
      this.logger.log(`Room ${roomId} deleted - all participants left`);
    } else {
      client.to(roomId).emit('participant-left', { participantId });
    }

    if (!silent) {
      client.emit('left', { roomId, participantId });
    }

    this.logger.log(`Participant ${participantId} left room ${roomId}`);

    return {
      event: 'leave',
      data: { success: true, participantId },
    };
  }

  @SubscribeMessage('offer')
  async handleOffer(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SignalingPayload,
  ): Promise<any> {
    const { roomId, targetId, data } = payload;
    const mapping = this.socketToParticipantMap.get(client.id);
    if (!mapping || mapping.roomId !== roomId) {
      return this.sendError(client, 'offer', 'Not in this room');
    }

    const targetSocket = await this.findSocketByParticipantId(roomId, targetId);
    if (targetSocket) {
      targetSocket.emit('offer', {
        senderId: mapping.participantId,
        data,
      });
    }

    return { event: 'offer', data: { success: true } };
  }

  @SubscribeMessage('answer')
  async handleAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SignalingPayload,
  ): Promise<any> {
    const { roomId, targetId, data } = payload;
    const mapping = this.socketToParticipantMap.get(client.id);
    if (!mapping || mapping.roomId !== roomId) {
      return this.sendError(client, 'answer', 'Not in this room');
    }

    const targetSocket = await this.findSocketByParticipantId(roomId, targetId);
    if (targetSocket) {
      targetSocket.emit('answer', {
        senderId: mapping.participantId,
        data,
      });
    }

    return { event: 'answer', data: { success: true } };
  }

  @SubscribeMessage('ice-candidate')
  async handleIceCandidate(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SignalingPayload,
  ): Promise<any> {
    const { roomId, targetId, data } = payload;
    const mapping = this.socketToParticipantMap.get(client.id);
    if (!mapping || mapping.roomId !== roomId) {
      return this.sendError(client, 'ice-candidate', 'Not in this room');
    }

    const targetSocket = await this.findSocketByParticipantId(roomId, targetId);
    if (targetSocket) {
      targetSocket.emit('ice-candidate', {
        senderId: mapping.participantId,
        data,
      });
    }

    return { event: 'ice-candidate', data: { success: true } };
  }

  @SubscribeMessage('mute')
  async handleMute(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string; type: 'audio' | 'video' },
  ): Promise<any> {
    const { roomId, type } = payload;
    const mapping = this.socketToParticipantMap.get(client.id);
    if (!mapping || mapping.roomId !== roomId) {
      return this.sendError(client, 'mute', 'Not in this room');
    }

    const updates: Partial<Participant> = {};
    if (type === 'audio') updates.isAudioMuted = true;
    if (type === 'video') updates.isVideoMuted = true;

    await this.roomStateService.updateParticipant(roomId, mapping.participantId, updates);

    client.to(roomId).emit('participant-muted', {
      participantId: mapping.participantId,
      type,
    });

    return { event: 'mute', data: { success: true, type } };
  }

  @SubscribeMessage('unmute')
  async handleUnmute(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string; type: 'audio' | 'video' },
  ): Promise<any> {
    const { roomId, type } = payload;
    const mapping = this.socketToParticipantMap.get(client.id);
    if (!mapping || mapping.roomId !== roomId) {
      return this.sendError(client, 'unmute', 'Not in this room');
    }

    const updates: Partial<Participant> = {};
    if (type === 'audio') updates.isAudioMuted = false;
    if (type === 'video') updates.isVideoMuted = false;

    await this.roomStateService.updateParticipant(roomId, mapping.participantId, updates);

    client.to(roomId).emit('participant-unmuted', {
      participantId: mapping.participantId,
      type,
    });

    return { event: 'unmute', data: { success: true, type } };
  }

  @SubscribeMessage('screen-share-start')
  async handleScreenShareStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string },
  ): Promise<any> {
    const { roomId } = payload;
    const mapping = this.socketToParticipantMap.get(client.id);
    if (!mapping || mapping.roomId !== roomId) {
      return this.sendError(client, 'screen-share-start', 'Not in this room');
    }

    const room = await this.roomStateService.getRoom(roomId);
    if (room?.screenSharingParticipantId) {
      return this.sendError(client, 'screen-share-start', 'Another participant is already sharing screen');
    }

    await this.roomStateService.updateParticipant(roomId, mapping.participantId, { isScreenSharing: true });
    await this.roomStateService.setScreenSharing(roomId, mapping.participantId);

    client.to(roomId).emit('screen-share-started', {
      participantId: mapping.participantId,
    });

    return { event: 'screen-share-start', data: { success: true } };
  }

  @SubscribeMessage('screen-share-stop')
  async handleScreenShareStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string },
  ): Promise<any> {
    const { roomId } = payload;
    const mapping = this.socketToParticipantMap.get(client.id);
    if (!mapping || mapping.roomId !== roomId) {
      return this.sendError(client, 'screen-share-stop', 'Not in this room');
    }

    await this.roomStateService.updateParticipant(roomId, mapping.participantId, { isScreenSharing: false });
    await this.roomStateService.setScreenSharing(roomId, null);

    client.to(roomId).emit('screen-share-stopped', {
      participantId: mapping.participantId,
    });

    return { event: 'screen-share-stop', data: { success: true } };
  }

  @SubscribeMessage('chat')
  async handleChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ChatPayload,
  ): Promise<any> {
    const { roomId, content } = payload;
    const mapping = this.socketToParticipantMap.get(client.id);
    if (!mapping || mapping.roomId !== roomId) {
      return this.sendError(client, 'chat', 'Not in this room');
    }

    if (!content || content.trim().length === 0) {
      return this.sendError(client, 'chat', 'Message cannot be empty');
    }

    const participant = (await this.roomStateService.getParticipants(roomId)).get(mapping.participantId);
    if (!participant) {
      return this.sendError(client, 'chat', 'Participant not found');
    }

    const timestamp = Date.now();

    await this.historyService.saveChatMessage(
      roomId,
      mapping.participantId,
      participant.name,
      content.trim(),
    );

    client.to(roomId).emit('chat-message', {
      senderId: mapping.participantId,
      senderName: participant.name,
      content: content.trim(),
      timestamp,
    });

    client.emit('chat-message', {
      senderId: mapping.participantId,
      senderName: participant.name,
      content: content.trim(),
      timestamp,
      self: true,
    });

    return {
      event: 'chat',
      data: { success: true, timestamp },
    };
  }

  @SubscribeMessage('host-action')
  async handleHostAction(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: HostActionPayload,
  ): Promise<any> {
    const { roomId, action, targetId } = payload;
    const mapping = this.socketToParticipantMap.get(client.id);
    if (!mapping || mapping.roomId !== roomId) {
      return this.sendError(client, 'host-action', 'Not in this room');
    }

    const room = await this.roomStateService.getRoom(roomId);
    if (!room) {
      return this.sendError(client, 'host-action', 'Room not found');
    }

    const hostParticipant = room.participants.get(mapping.participantId);
    if (!hostParticipant?.isHost) {
      return this.sendError(client, 'host-action', 'Only host can perform this action');
    }

    const targetParticipant = room.participants.get(targetId);
    if (!targetParticipant) {
      return this.sendError(client, 'host-action', 'Target participant not found');
    }

    if (action === 'mute-participant') {
      await this.roomStateService.updateParticipant(roomId, targetId, {
        isAudioMuted: true,
        isVideoMuted: true,
      });

      const targetSocket = await this.findSocketByParticipantId(roomId, targetId);
      if (targetSocket) {
        targetSocket.emit('host-muted', {
          byHost: mapping.participantId,
          types: ['audio', 'video'],
        });
      }

      client.to(roomId).emit('participant-muted', {
        participantId: targetId,
        type: 'both',
        byHost: true,
      });

      return { event: 'host-action', data: { success: true, action: 'muted', targetId } };
    }

    if (action === 'remove-participant') {
      const targetSocket = await this.findSocketByParticipantId(roomId, targetId);
      if (targetSocket) {
        targetSocket.emit('removed-by-host', {
          byHost: mapping.participantId,
          roomId,
        });
        await this.handleLeaveRoom(targetSocket, { roomId, silent: true });
      }

      client.to(roomId).emit('participant-removed', {
        participantId: targetId,
        byHost: mapping.participantId,
      });

      return { event: 'host-action', data: { success: true, action: 'removed', targetId } };
    }

    return this.sendError(client, 'host-action', 'Invalid action');
  }

  private async findSocketByParticipantId(roomId: string, participantId: string): Promise<Socket | null> {
    const participants = await this.roomStateService.getParticipants(roomId);
    const participant = participants.get(participantId);
    if (!participant) return null;

    const socket = this.server.sockets.sockets.get(participant.socketId);
    return socket || null;
  }

  private sendError(client: Socket, event: string, message: string): any {
    client.emit('error', { event, message });
    return {
      event,
      data: { success: false, error: message },
    };
  }
}
