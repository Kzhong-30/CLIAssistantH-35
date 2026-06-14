import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { Participant, RoomState } from '../common/types';
import { nanoid } from 'nanoid';

interface RoomData {
  id: string;
  name: string;
  hostId: string;
  temporaryPassword: string;
  createdAt: number;
  maxParticipants: number;
  currentSpeakerId: string | null;
  screenSharingParticipantId: string | null;
  isRecording: boolean;
  recordingStartedAt: number | null;
}

interface RoomStats {
  totalParticipants: number;
  peakParticipants: number;
}

@Injectable()
export class RoomStateService implements OnModuleInit {
  private readonly logger = new Logger(RoomStateService.name);
  private readonly ROOM_KEY_PREFIX = 'room:';
  private readonly PARTICIPANT_KEY_PREFIX = 'room:participants:';
  private readonly WAITING_QUEUE_PREFIX = 'room:queue:';
  private readonly STATS_KEY_PREFIX = 'room:stats:';

  private redisAvailable = false;

  private memoryRooms = new Map<string, RoomData>();
  private memoryParticipants = new Map<string, Map<string, Participant>>();
  private memoryWaitingQueue = new Map<string, Participant[]>();
  private memoryStats = new Map<string, RoomStats>();

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}


  private async syncMemoryToRedis(): Promise<void> {
    try {
      const roomIds = new Set<string>();
      for (const roomId of this.memoryRooms.keys()) roomIds.add(roomId);
      for (const roomId of this.memoryParticipants.keys()) roomIds.add(roomId);
      for (const roomId of this.memoryWaitingQueue.keys()) roomIds.add(roomId);
      for (const roomId of this.memoryStats.keys()) roomIds.add(roomId);

      const pipeline = this.redis.pipeline();

      for (const roomId of roomIds) {
        const room = this.memoryRooms.get(roomId);
        if (room) {
          pipeline.hmset(this.ROOM_KEY_PREFIX + roomId, this.objectToRecord(room));
        }
        pipeline.expire(this.ROOM_KEY_PREFIX + roomId, 86400);

        const participants = this.memoryParticipants.get(roomId);
        if (participants && participants.size > 0) {
          for (const [participantId, participant] of participants.entries()) {
            pipeline.hset(this.PARTICIPANT_KEY_PREFIX + roomId, participantId, JSON.stringify(participant));
          }
        }
        pipeline.expire(this.PARTICIPANT_KEY_PREFIX + roomId, 86400);

        const queue = this.memoryWaitingQueue.get(roomId);
        if (queue && queue.length > 0) {
          for (const p of queue) {
            pipeline.rpush(this.WAITING_QUEUE_PREFIX + roomId, JSON.stringify(p));
          }
        }
        pipeline.expire(this.WAITING_QUEUE_PREFIX + roomId, 86400);

        const stats = this.memoryStats.get(roomId);
        if (stats) {
          pipeline.hmset(this.STATS_KEY_PREFIX + roomId, { totalParticipants: String(stats.totalParticipants), peakParticipants: String(stats.peakParticipants) });
        }
        pipeline.expire(this.STATS_KEY_PREFIX + roomId, 86400);
      }

      await pipeline.exec();

      const syncedCount = roomIds.size;
      if (syncedCount > 0) {
        this.logger.log("Synced " + syncedCount + " rooms from memory to Redis after reconnection");
      }
    } catch (e) {
      this.logger.error("Failed to sync memory to Redis: " + e.message);
    }
  }
  async onModuleInit(): Promise<void> {
    this.redis.on('connect', async () => {
      this.redisAvailable = true;
      this.logger.log('Redis available - switching to Redis storage');
      await this.syncMemoryToRedis();
    });
    this.redis.on('close', () => {
      this.redisAvailable = false;
      this.logger.warn('Redis unavailable - switching to memory storage');
    });
    this.redis.on('error', () => {
      this.redisAvailable = false;
    });

    try {
      const pong = await Promise.race([
        this.redis.ping(),
        new Promise<string>((_, reject) => setTimeout(() => reject(new Error('timeout')), 1000)),
      ]);
      this.redisAvailable = pong === 'PONG';
    } catch {
      this.redisAvailable = false;
      this.logger.warn('Redis not available on startup - using memory storage');
    }
  }

  private isRedisReady(): boolean {
    return this.redisAvailable && this.redis.status === 'ready';
  }

  async createRoom(roomId: string, roomName: string, hostId: string, maxParticipants: number): Promise<RoomState> {
    const tempPassword = nanoid(8);
    const now = Date.now();

    const roomData: RoomData = {
      id: roomId,
      name: roomName,
      hostId,
      temporaryPassword: tempPassword,
      createdAt: now,
      maxParticipants,
      currentSpeakerId: null,
      screenSharingParticipantId: null,
      isRecording: false,
      recordingStartedAt: null,
    };

    if (this.isRedisReady()) {
      try {
        await this.redis.hmset(`${this.ROOM_KEY_PREFIX}${roomId}`, this.objectToRecord(roomData));
        await this.redis.expire(`${this.ROOM_KEY_PREFIX}${roomId}`, 86400);
        await this.redis.hmset(`${this.STATS_KEY_PREFIX}${roomId}`, {
          totalParticipants: '0',
          peakParticipants: '0',
        });
        await this.redis.expire(`${this.STATS_KEY_PREFIX}${roomId}`, 86400);
      } catch (e) {
        this.logger.warn(`Redis createRoom failed, falling back to memory: ${e.message}`);
        this.saveRoomToMemory(roomId, roomData);
      }
    } else {
      this.saveRoomToMemory(roomId, roomData);
    }

    return {
      ...roomData,
      participants: new Map(),
      waitingQueue: [],
    } as RoomState;
  }

  private saveRoomToMemory(roomId: string, data: RoomData): void {
    this.memoryRooms.set(roomId, data);
    this.memoryParticipants.set(roomId, new Map());
    this.memoryWaitingQueue.set(roomId, []);
    this.memoryStats.set(roomId, { totalParticipants: 0, peakParticipants: 0 });
  }

  async getRoom(roomId: string): Promise<RoomState | null> {
    let roomData: RoomData | null = null;

    if (this.isRedisReady()) {
      try {
        const data = await this.redis.hgetall(`${this.ROOM_KEY_PREFIX}${roomId}`);
        if (Object.keys(data).length > 0) {
          roomData = {
            id: data.id,
            name: data.name,
            hostId: data.hostId,
            temporaryPassword: data.temporaryPassword,
            createdAt: parseInt(data.createdAt, 10),
            maxParticipants: parseInt(data.maxParticipants, 10),
            currentSpeakerId: data.currentSpeakerId || null,
            screenSharingParticipantId: data.screenSharingParticipantId || null,
            isRecording: data.isRecording === 'true',
            recordingStartedAt: data.recordingStartedAt ? parseInt(data.recordingStartedAt, 10) : null,
          };
        }
      } catch (e) {
        this.logger.warn(`Redis getRoom failed, falling back to memory: ${e.message}`);
        roomData = this.memoryRooms.get(roomId) || null;
      }
    } else {
      roomData = this.memoryRooms.get(roomId) || null;
    }

    if (!roomData) return null;

    const participants = await this.getParticipants(roomId);
    const waitingQueue = await this.getWaitingQueue(roomId);

    return {
      ...roomData,
      participants,
      waitingQueue,
    };
  }

  async roomExists(roomId: string): Promise<boolean> {
    if (this.isRedisReady()) {
      try {
        const result = await this.redis.exists(`${this.ROOM_KEY_PREFIX}${roomId}`);
        return result > 0;
      } catch (e) {
        return this.memoryRooms.has(roomId);
      }
    }
    return this.memoryRooms.has(roomId);
  }

  async deleteRoom(roomId: string): Promise<void> {
    if (this.isRedisReady()) {
      try {
        await this.redis.del(`${this.ROOM_KEY_PREFIX}${roomId}`);
        await this.redis.del(`${this.PARTICIPANT_KEY_PREFIX}${roomId}`);
        await this.redis.del(`${this.WAITING_QUEUE_PREFIX}${roomId}`);
        await this.redis.del(`${this.STATS_KEY_PREFIX}${roomId}`);
      } catch (e) {
        this.logger.warn(`Redis deleteRoom failed: ${e.message}`);
      }
    }
    this.memoryRooms.delete(roomId);
    this.memoryParticipants.delete(roomId);
    this.memoryWaitingQueue.delete(roomId);
    this.memoryStats.delete(roomId);
  }

  async getParticipants(roomId: string): Promise<Map<string, Participant>> {
    const map = new Map<string, Participant>();

    if (this.isRedisReady()) {
      try {
        const data = await this.redis.hgetall(`${this.PARTICIPANT_KEY_PREFIX}${roomId}`);
        for (const [id, json] of Object.entries(data)) {
          try {
            map.set(id, JSON.parse(json) as Participant);
          } catch (e) {
            this.logger.error(`Failed to parse participant ${id}: ${e.message}`);
          }
        }
        return map;
      } catch (e) {
        this.logger.warn(`Redis getParticipants failed, falling back to memory: ${e.message}`);
      }
    }

    const memMap = this.memoryParticipants.get(roomId);
    if (memMap) {
      for (const [id, p] of memMap.entries()) {
        map.set(id, p);
      }
    }
    return map;
  }

  async addParticipant(roomId: string, participant: Participant): Promise<void> {
    if (this.isRedisReady()) {
      try {
        await this.redis.hset(
          `${this.PARTICIPANT_KEY_PREFIX}${roomId}`,
          participant.id,
          JSON.stringify(participant),
        );
        await this.redis.expire(`${this.PARTICIPANT_KEY_PREFIX}${roomId}`, 86400);
        return;
      } catch (e) {
        this.logger.warn(`Redis addParticipant failed, falling back to memory: ${e.message}`);
      }
    }

    if (!this.memoryParticipants.has(roomId)) {
      this.memoryParticipants.set(roomId, new Map());
    }
    this.memoryParticipants.get(roomId)!.set(participant.id, participant);
  }

  async removeParticipant(roomId: string, participantId: string): Promise<Participant | null> {
    let result: Participant | null = null;

    if (this.isRedisReady()) {
      try {
        const data = await this.redis.hget(`${this.PARTICIPANT_KEY_PREFIX}${roomId}`, participantId);
        if (data) {
          result = JSON.parse(data) as Participant;
          await this.redis.hdel(`${this.PARTICIPANT_KEY_PREFIX}${roomId}`, participantId);
        }
      } catch (e) {
        this.logger.warn(`Redis removeParticipant failed: ${e.message}`);
      }
    }

    const memMap = this.memoryParticipants.get(roomId);
    if (memMap) {
      const memResult = memMap.get(participantId);
      if (memResult) {
        result = result || memResult;
        memMap.delete(participantId);
      }
    }
    return result;
  }

  async updateParticipant(roomId: string, participantId: string, updates: Partial<Participant>): Promise<Participant | null> {
    let updated: Participant | null = null;

    if (this.isRedisReady()) {
      try {
        const data = await this.redis.hget(`${this.PARTICIPANT_KEY_PREFIX}${roomId}`, participantId);
        if (data) {
          const participant = JSON.parse(data) as Participant;
          updated = { ...participant, ...updates };
          await this.redis.hset(
            `${this.PARTICIPANT_KEY_PREFIX}${roomId}`,
            participantId,
            JSON.stringify(updated),
          );
        }
      } catch (e) {
        this.logger.warn(`Redis updateParticipant failed: ${e.message}`);
      }
    }

    const memMap = this.memoryParticipants.get(roomId);
    if (memMap) {
      const participant = memMap.get(participantId);
      if (participant) {
        updated = { ...participant, ...updates };
        memMap.set(participantId, updated);
      }
    }
    return updated;
  }

  async getParticipantCount(roomId: string): Promise<number> {
    if (this.isRedisReady()) {
      try {
        return await this.redis.hlen(`${this.PARTICIPANT_KEY_PREFIX}${roomId}`);
      } catch (e) {
        this.logger.warn(`Redis getParticipantCount failed: ${e.message}`);
      }
    }
    return this.memoryParticipants.get(roomId)?.size || 0;
  }

  async getWaitingQueue(roomId: string): Promise<Participant[]> {
    if (this.isRedisReady()) {
      try {
        const data = await this.redis.lrange(`${this.WAITING_QUEUE_PREFIX}${roomId}`, 0, -1);
        return data.map((d) => JSON.parse(d) as Participant);
      } catch (e) {
        this.logger.warn(`Redis getWaitingQueue failed: ${e.message}`);
      }
    }
    return [...(this.memoryWaitingQueue.get(roomId) || [])];
  }

  async addToWaitingQueue(roomId: string, participant: Participant): Promise<number> {
    if (this.isRedisReady()) {
      try {
        const position = await this.redis.rpush(
          `${this.WAITING_QUEUE_PREFIX}${roomId}`,
          JSON.stringify(participant),
        );
        await this.redis.expire(`${this.WAITING_QUEUE_PREFIX}${roomId}`, 86400);
        return position;
      } catch (e) {
        this.logger.warn(`Redis addToWaitingQueue failed: ${e.message}`);
      }
    }

    if (!this.memoryWaitingQueue.has(roomId)) {
      this.memoryWaitingQueue.set(roomId, []);
    }
    this.memoryWaitingQueue.get(roomId)!.push(participant);
    return this.memoryWaitingQueue.get(roomId)!.length;
  }

  async removeFromWaitingQueue(roomId: string, participantId: string): Promise<void> {
    if (this.isRedisReady()) {
      try {
        const queue = await this.getWaitingQueue(roomId);
        const newQueue = queue.filter((p) => p.id !== participantId);
        await this.redis.del(`${this.WAITING_QUEUE_PREFIX}${roomId}`);
        if (newQueue.length > 0) {
          for (const p of newQueue) {
            await this.redis.rpush(`${this.WAITING_QUEUE_PREFIX}${roomId}`, JSON.stringify(p));
          }
        }
      } catch (e) {
        this.logger.warn(`Redis removeFromWaitingQueue failed: ${e.message}`);
      }
    }

    const memQueue = this.memoryWaitingQueue.get(roomId);
    if (memQueue) {
      this.memoryWaitingQueue.set(
        roomId,
        memQueue.filter((p) => p.id !== participantId),
      );
    }
  }

  async getNextFromWaitingQueue(roomId: string): Promise<Participant | null> {
    if (this.isRedisReady()) {
      try {
        const data = await this.redis.lpop(`${this.WAITING_QUEUE_PREFIX}${roomId}`);
        if (data) return JSON.parse(data) as Participant;
      } catch (e) {
        this.logger.warn(`Redis getNextFromWaitingQueue failed: ${e.message}`);
      }
    }

    const memQueue = this.memoryWaitingQueue.get(roomId);
    if (memQueue && memQueue.length > 0) {
      return memQueue.shift()!;
    }
    return null;
  }

  async setCurrentSpeaker(roomId: string, participantId: string | null): Promise<void> {
    if (this.isRedisReady()) {
      try {
        if (participantId) {
          await this.redis.hset(`${this.ROOM_KEY_PREFIX}${roomId}`, 'currentSpeakerId', participantId);
        } else {
          await this.redis.hdel(`${this.ROOM_KEY_PREFIX}${roomId}`, 'currentSpeakerId');
        }
        return;
      } catch (e) {
        this.logger.warn(`Redis setCurrentSpeaker failed: ${e.message}`);
      }
    }

    const room = this.memoryRooms.get(roomId);
    if (room) room.currentSpeakerId = participantId;
  }

  async setScreenSharing(roomId: string, participantId: string | null): Promise<void> {
    if (this.isRedisReady()) {
      try {
        if (participantId) {
          await this.redis.hset(`${this.ROOM_KEY_PREFIX}${roomId}`, 'screenSharingParticipantId', participantId);
        } else {
          await this.redis.hdel(`${this.ROOM_KEY_PREFIX}${roomId}`, 'screenSharingParticipantId');
        }
        return;
      } catch (e) {
        this.logger.warn(`Redis setScreenSharing failed: ${e.message}`);
      }
    }

    const room = this.memoryRooms.get(roomId);
    if (room) room.screenSharingParticipantId = participantId;
  }

  async setRecordingStatus(roomId: string, isRecording: boolean, startedAt: number | null = null): Promise<void> {
    if (this.isRedisReady()) {
      try {
        await this.redis.hset(
          `${this.ROOM_KEY_PREFIX}${roomId}`,
          'isRecording',
          isRecording ? 'true' : 'false',
        );
        if (startedAt) {
          await this.redis.hset(`${this.ROOM_KEY_PREFIX}${roomId}`, 'recordingStartedAt', startedAt.toString());
        } else if (!isRecording) {
          await this.redis.hdel(`${this.ROOM_KEY_PREFIX}${roomId}`, 'recordingStartedAt');
        }
        return;
      } catch (e) {
        this.logger.warn(`Redis setRecordingStatus failed: ${e.message}`);
      }
    }

    const room = this.memoryRooms.get(roomId);
    if (room) {
      room.isRecording = isRecording;
      room.recordingStartedAt = isRecording ? startedAt : null;
    }
  }

  async updateRoomField(roomId: string, field: string, value: string | number | boolean | null): Promise<void> {
    if (this.isRedisReady()) {
      try {
        if (value === null || value === undefined) {
          await this.redis.hdel(`${this.ROOM_KEY_PREFIX}${roomId}`, field);
        } else {
          await this.redis.hset(
            `${this.ROOM_KEY_PREFIX}${roomId}`,
            field,
            typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value),
          );
        }
        return;
      } catch (e) {
        this.logger.warn(`Redis updateRoomField failed: ${e.message}`);
      }
    }

    const room = this.memoryRooms.get(roomId);
    if (room) {
      (room as any)[field] = value;
    }
  }

  async incrementTotalParticipants(roomId: string, currentCount: number): Promise<void> {
    if (this.isRedisReady()) {
      try {
        await this.redis.hincrby(`${this.STATS_KEY_PREFIX}${roomId}`, 'totalParticipants', 1);
        const currentPeak = parseInt(
          (await this.redis.hget(`${this.STATS_KEY_PREFIX}${roomId}`, 'peakParticipants')) || '0',
          10,
        );
        if (currentCount > currentPeak) {
          await this.redis.hset(`${this.STATS_KEY_PREFIX}${roomId}`, 'peakParticipants', currentCount.toString());
        }
        return;
      } catch (e) {
        this.logger.warn(`Redis incrementTotalParticipants failed: ${e.message}`);
      }
    }

    const stats = this.memoryStats.get(roomId);
    if (stats) {
      stats.totalParticipants++;
      if (currentCount > stats.peakParticipants) {
        stats.peakParticipants = currentCount;
      }
    }
  }

  async getRoomStats(roomId: string): Promise<{ total: number; peak: number }> {
    if (this.isRedisReady()) {
      try {
        const stats = await this.redis.hgetall(`${this.STATS_KEY_PREFIX}${roomId}`);
        return {
          total: parseInt(stats.totalParticipants || '0', 10),
          peak: parseInt(stats.peakParticipants || '0', 10),
        };
      } catch (e) {
        this.logger.warn(`Redis getRoomStats failed: ${e.message}`);
      }
    }
    const mem = this.memoryStats.get(roomId);
    return mem ? { total: mem.totalParticipants, peak: mem.peakParticipants } : { total: 0, peak: 0 };
  }

  private objectToRecord(obj: any): Record<string, string> {
    const record: Record<string, string> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== null && value !== undefined) {
        record[key] = typeof value === 'object' ? JSON.stringify(value) : String(value);
      }
    }
    return record;
  }
}
