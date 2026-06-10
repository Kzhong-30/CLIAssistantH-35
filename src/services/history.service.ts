import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoomHistory } from '../entities/room-history.entity';
import { ParticipantHistory } from '../entities/participant-history.entity';
import { ChatMessage } from '../entities/chat-message.entity';
import { RecordingLog } from '../entities/recording-log.entity';
import { Participant } from '../common/types';

@Injectable()
export class HistoryService {
  private readonly logger = new Logger(HistoryService.name);

  constructor(
    @InjectRepository(RoomHistory)
    private readonly roomHistoryRepo: Repository<RoomHistory>,
    @InjectRepository(ParticipantHistory)
    private readonly participantHistoryRepo: Repository<ParticipantHistory>,
    @InjectRepository(ChatMessage)
    private readonly chatMessageRepo: Repository<ChatMessage>,
    @InjectRepository(RecordingLog)
    private readonly recordingLogRepo: Repository<RecordingLog>,
  ) {}

  async updateRoomHostId(roomId: string, hostId: string): Promise<void> {
    try {
      const room = await this.roomHistoryRepo.findOne({ where: { roomId } });
      if (room) {
        room.hostId = hostId;
        await this.roomHistoryRepo.save(room);
      }
    } catch (e) {
      this.logger.error(`Failed to update room hostId: `);
    }
  }

  async createRoomHistory(
    roomId: string,
    name: string,
    hostId: string,
    temporaryPassword: string,
    maxParticipants: number,
  ): Promise<RoomHistory> {
    const room = this.roomHistoryRepo.create({
      roomId,
      name,
      hostId,
      temporaryPassword,
      maxParticipants,
      status: 'active',
    });
    return this.roomHistoryRepo.save(room);
  }

  async endRoomHistory(roomId: string, finalParticipantCount: number, peakCount: number): Promise<void> {
    const room = await this.roomHistoryRepo.findOne({ where: { roomId } });
    if (room) {
      room.endedAt = new Date();
      room.status = 'ended';
      room.totalParticipants = finalParticipantCount;
      room.peakParticipants = peakCount;
      await this.roomHistoryRepo.save(room);
    }
  }

  async addParticipantHistory(participant: Participant, roomId: string): Promise<void> {
    try {
      const record = this.participantHistoryRepo.create({
        participantId: participant.id,
        name: participant.name,
        isHost: participant.isHost,
        roomId,
        joinedAt: new Date(participant.joinedAt),
      });
      await this.participantHistoryRepo.save(record);
    } catch (e) {
      this.logger.error(`Failed to save participant history: ${e.message}`);
    }
  }

  async updateParticipantOnLeave(participantId: string, wasMuted: boolean, sharedScreen: boolean): Promise<void> {
    try {
      const record = await this.participantHistoryRepo.findOne({
        where: { participantId, leftAt: null },
        order: { joinedAt: 'DESC' },
      });
      if (record) {
        record.leftAt = new Date();
        record.duration = Math.floor((record.leftAt.getTime() - record.joinedAt.getTime()) / 1000);
        record.wasMuted = wasMuted;
        record.sharedScreen = sharedScreen;
        await this.participantHistoryRepo.save(record);
      }
    } catch (e) {
      this.logger.error(`Failed to update participant history on leave: ${e.message}`);
    }
  }

  async saveChatMessage(
    roomId: string,
    senderId: string,
    senderName: string,
    content: string,
  ): Promise<void> {
    try {
      const msg = this.chatMessageRepo.create({
        roomId,
        senderId,
        senderName,
        content,
      });
      await this.chatMessageRepo.save(msg);
    } catch (e) {
      this.logger.error(`Failed to save chat message: ${e.message}`);
    }
  }

  async startRecordingLog(
    recordingId: string,
    roomId: string,
    startedBy: string,
  ): Promise<void> {
    try {
      const log = this.recordingLogRepo.create({
        recordingId,
        roomId,
        startedBy,
        status: 'recording',
      });
      await this.recordingLogRepo.save(log);
    } catch (e) {
      this.logger.error(`Failed to create recording log: ${e.message}`);
    }
  }

  async stopRecordingLog(recordingId: string, status: string = 'stopped'): Promise<void> {
    try {
      const log = await this.recordingLogRepo.findOne({ where: { recordingId } });
      if (log) {
        log.stoppedAt = new Date();
        log.duration = Math.floor((log.stoppedAt.getTime() - log.startedAt.getTime()) / 1000);
        log.status = status;
        log.recordingUrl = `https://storage.example.com/recordings/${recordingId}.mp4`;
        await this.recordingLogRepo.save(log);
      }
    } catch (e) {
      this.logger.error(`Failed to stop recording log: ${e.message}`);
    }
  }
}
