import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { nanoid } from 'nanoid';
import {
  CreateRoomDto,
  CreateRoomResponseDto,
  RoomInfoDto,
  ParticipantInfoDto,
  RoomStatsDto,
  RecordingRequestDto,
  RecordingResponseDto,
} from '../dto/room.dto';
import { RoomStateService } from '../services/room-state.service';
import { HistoryService } from '../services/history.service';

@ApiTags('rooms')
@Controller('rooms')
export class RoomController {
  constructor(
    private readonly roomStateService: RoomStateService,
    private readonly historyService: HistoryService,
  ) {}

  @Post()
  @ApiOperation({ summary: '创建新的视频会议房间' })
  @ApiResponse({ status: 201, description: '房间创建成功', type: CreateRoomResponseDto })
  async createRoom(@Body() createRoomDto: CreateRoomDto): Promise<CreateRoomResponseDto> {
    const roomId = nanoid(12);
    const maxParticipants = createRoomDto.maxParticipants || 10;
    const hostId = '';

    const room = await this.roomStateService.createRoom(
      roomId,
      createRoomDto.name,
      hostId,
      maxParticipants,
    );

    await this.historyService.createRoomHistory(
      roomId,
      createRoomDto.name,
      hostId,
      room.temporaryPassword,
      maxParticipants,
    );

    return {
      roomId,
      name: createRoomDto.name,
      temporaryPassword: room.temporaryPassword,
      hostId,
      maxParticipants,
      createdAt: room.createdAt,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: '获取房间信息和参与者列表' })
  @ApiParam({ name: 'id', description: '房间 ID' })
  @ApiResponse({ status: 200, description: '获取房间信息成功', type: RoomInfoDto })
  @ApiResponse({ status: 404, description: '房间不存在' })
  async getRoomInfo(@Param('id') roomId: string): Promise<RoomInfoDto> {
    const room = await this.roomStateService.getRoom(roomId);
    if (!room) {
      throw new NotFoundException('Room not found');
    }

    const participantList: ParticipantInfoDto[] = Array.from(
      room.participants.values() as IterableIterator<any>,
    ).map((p) => ({
      id: p.id,
      name: p.name,
      isHost: p.isHost,
      isAudioMuted: p.isAudioMuted,
      isVideoMuted: p.isVideoMuted,
      isScreenSharing: p.isScreenSharing,
      joinedAt: p.joinedAt,
    }));

    return {
      id: room.id,
      name: room.name,
      hostId: room.hostId,
      maxParticipants: room.maxParticipants,
      createdAt: room.createdAt,
      currentSpeakerId: room.currentSpeakerId,
      screenSharingParticipantId: room.screenSharingParticipantId,
      isRecording: room.isRecording,
      participants: participantList,
      waitingQueueCount: room.waitingQueue.length,
    };
  }

  @Get(':id/stats')
  @ApiOperation({ summary: '获取通话统计（模拟数据）' })
  @ApiParam({ name: 'id', description: '房间 ID' })
  @ApiResponse({ status: 200, description: '获取统计成功', type: RoomStatsDto })
  @ApiResponse({ status: 404, description: '房间不存在' })
  async getRoomStats(@Param('id') roomId: string): Promise<RoomStatsDto> {
    const room = await this.roomStateService.getRoom(roomId);
    if (!room) {
      throw new NotFoundException('Room not found');
    }

    const now = Date.now();
    const duration = Math.floor((now - room.createdAt) / 1000);
    const activeParticipants = room.participants.size;

    const averageBitrate = 800 + Math.floor(Math.random() * 2400);
    const packetLossRate = Math.random() * 2;
    const { total: totalParticipants } = await this.roomStateService.getRoomStats(roomId);

    return {
      roomId,
      duration,
      averageBitrate,
      packetLossRate: parseFloat(packetLossRate.toFixed(2)),
      activeParticipants,
      totalParticipants,
    };
  }

  @Post(':id/recordings')
  @ApiOperation({ summary: '开始或停止云端录制（模拟）' })
  @ApiParam({ name: 'id', description: '房间 ID' })
  @ApiResponse({ status: 200, description: '录制操作完成', type: RecordingResponseDto })
  @ApiResponse({ status: 404, description: '房间不存在' })
  @ApiResponse({ status: 401, description: '无权限 - 仅主持人可管理录制' })
  async manageRecording(
    @Param('id') roomId: string,
    @Body() recordingDto: RecordingRequestDto,
  ): Promise<RecordingResponseDto> {
    const room = await this.roomStateService.getRoom(roomId);
    if (!room) {
      throw new NotFoundException('Room not found');
    }

    if (room.hostId !== recordingDto.hostId || !room.hostId) {
      throw new UnauthorizedException('Only the room host can manage recording');
    }

    const now = Date.now();

    if (recordingDto.action === 'start') {
      if (room.isRecording) {
        throw new BadRequestException('Recording is already in progress');
      }

      const recordingId = nanoid(10);
      await this.roomStateService.setRecordingStatus(roomId, true, now);
      await this.historyService.startRecordingLog(recordingId, roomId, recordingDto.hostId);

      return {
        recordingId,
        roomId,
        status: 'recording',
        startedAt: now,
      };
    } else {
      if (!room.isRecording) {
        throw new BadRequestException('No recording in progress');
      }

      const recordingId = nanoid(10);
      await this.roomStateService.setRecordingStatus(roomId, false);
      await this.historyService.stopRecordingLog(recordingId, 'stopped');

      return {
        recordingId,
        roomId,
        status: 'stopped',
        startedAt: room.recordingStartedAt || now,
        stoppedAt: now,
        recordingUrl: `https://storage.example.com/recordings/${recordingId}.mp4`,
      };
    }
  }
}
