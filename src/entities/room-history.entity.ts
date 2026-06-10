import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { ParticipantHistory } from './participant-history.entity';
import { ChatMessage } from './chat-message.entity';
import { RecordingLog } from './recording-log.entity';

@Entity('rooms')
export class RoomHistory {
  @PrimaryGeneratedColumn('uuid')
  @ApiProperty({ description: 'Database record ID' })
  id: string;

  @Column({ unique: true })
  @ApiProperty({ description: 'Unique room ID' })
  roomId: string;

  @Column()
  @ApiProperty({ description: 'Room name' })
  name: string;

  @Column()
  @ApiProperty({ description: 'Host user ID' })
  hostId: string;

  @Column()
  @ApiProperty({ description: 'Temporary room password' })
  temporaryPassword: string;

  @Column({ default: 10 })
  @ApiProperty({ description: 'Maximum number of participants' })
  maxParticipants: number;

  @CreateDateColumn()
  @ApiProperty({ description: 'Room creation time' })
  createdAt: Date;

  @Column({ type: 'datetime', nullable: true })
  @ApiProperty({ description: 'Room end time' })
  endedAt: Date | null;

  @Column({ default: 0 })
  @ApiProperty({ description: 'Total number of participants joined' })
  totalParticipants: number;

  @Column({ default: 0 })
  @ApiProperty({ description: 'Maximum concurrent participants' })
  peakParticipants: number;

  @Column({ default: 'ended' })
  @ApiProperty({ description: 'Room status: active | ended' })
  status: string;

  @OneToMany(() => ParticipantHistory, p => p.room)
  participants: ParticipantHistory[];

  @OneToMany(() => ChatMessage, m => m.room)
  messages: ChatMessage[];

  @OneToMany(() => RecordingLog, r => r.room)
  recordings: RecordingLog[];
}
