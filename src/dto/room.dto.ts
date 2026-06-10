import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MaxLength, IsOptional, IsInt, Min, Max } from 'class-validator';

export class CreateRoomDto {
  @ApiProperty({ description: 'Room name', example: 'Daily Standup' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ description: 'Host user name', example: 'John Doe' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  hostName: string;

  @ApiPropertyOptional({ description: 'Maximum number of participants', example: 10 })
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(100)
  maxParticipants?: number;
}

export class CreateRoomResponseDto {
  @ApiProperty({ description: 'Unique room ID' })
  roomId: string;

  @ApiProperty({ description: 'Room name' })
  name: string;

  @ApiProperty({ description: 'Temporary room password' })
  temporaryPassword: string;

  @ApiProperty({ description: 'Host participant ID' })
  hostId: string;

  @ApiProperty({ description: 'Maximum participants allowed' })
  maxParticipants: number;

  @ApiProperty({ description: 'Room creation timestamp' })
  createdAt: number;
}

export class ParticipantInfoDto {
  @ApiProperty({ description: 'Participant ID' })
  id: string;

  @ApiProperty({ description: 'Participant name' })
  name: string;

  @ApiProperty({ description: 'Is host' })
  isHost: boolean;

  @ApiProperty({ description: 'Is audio muted' })
  isAudioMuted: boolean;

  @ApiProperty({ description: 'Is video muted' })
  isVideoMuted: boolean;

  @ApiProperty({ description: 'Is screen sharing' })
  isScreenSharing: boolean;

  @ApiProperty({ description: 'Joined at timestamp' })
  joinedAt: number;
}

export class RoomInfoDto {
  @ApiProperty({ description: 'Room ID' })
  id: string;

  @ApiProperty({ description: 'Room name' })
  name: string;

  @ApiProperty({ description: 'Host ID' })
  hostId: string;

  @ApiProperty({ description: 'Maximum participants' })
  maxParticipants: number;

  @ApiProperty({ description: 'Created at timestamp' })
  createdAt: number;

  @ApiProperty({ description: 'Current speaker ID' })
  currentSpeakerId: string | null;

  @ApiProperty({ description: 'Screen sharing participant ID' })
  screenSharingParticipantId: string | null;

  @ApiProperty({ description: 'Is currently recording' })
  isRecording: boolean;

  @ApiProperty({ type: [ParticipantInfoDto], description: 'List of participants' })
  participants: ParticipantInfoDto[];

  @ApiProperty({ description: 'Number of participants in waiting queue' })
  waitingQueueCount: number;
}

export class RoomStatsDto {
  @ApiProperty({ description: 'Room ID' })
  roomId: string;

  @ApiProperty({ description: 'Call duration in seconds' })
  duration: number;

  @ApiProperty({ description: 'Average bitrate in kbps' })
  averageBitrate: number;

  @ApiProperty({ description: 'Packet loss rate percentage' })
  packetLossRate: number;

  @ApiProperty({ description: 'Current active participants count' })
  activeParticipants: number;

  @ApiProperty({ description: 'Total participants joined count' })
  totalParticipants: number;
}

export class RecordingRequestDto {
  @ApiProperty({ description: 'Host participant ID' })
  @IsString()
  @IsNotEmpty()
  hostId: string;

  @ApiProperty({ description: 'Action to perform: start | stop', example: 'start' })
  @IsString()
  @IsNotEmpty()
  action: 'start' | 'stop';
}

export class RecordingResponseDto {
  @ApiProperty({ description: 'Recording ID' })
  recordingId: string;

  @ApiProperty({ description: 'Room ID' })
  roomId: string;

  @ApiProperty({ description: 'Recording status' })
  status: string;

  @ApiProperty({ description: 'Started at timestamp' })
  startedAt: number;

  @ApiPropertyOptional({ description: 'Stopped at timestamp' })
  stoppedAt?: number;

  @ApiPropertyOptional({ description: 'Recording URL (when stopped)' })
  recordingUrl?: string;
}
