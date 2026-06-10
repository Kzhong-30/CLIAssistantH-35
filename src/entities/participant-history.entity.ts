import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { RoomHistory } from './room-history.entity';

@Entity('participants')
export class ParticipantHistory {
  @PrimaryGeneratedColumn('uuid')
  @ApiProperty({ description: 'Database record ID' })
  id: string;

  @Column()
  @ApiProperty({ description: 'Participant unique ID' })
  participantId: string;

  @Column()
  @ApiProperty({ description: 'Participant name' })
  name: string;

  @Column({ default: false })
  @ApiProperty({ description: 'Whether participant was host' })
  isHost: boolean;

  @Column()
  @ApiProperty({ description: 'Room ID' })
  roomId: string;

  @ManyToOne(() => RoomHistory, room => room.participants)
  @JoinColumn({ name: 'roomId', referencedColumnName: 'roomId' })
  room: RoomHistory;

  @CreateDateColumn()
  @ApiProperty({ description: 'Join time' })
  joinedAt: Date;

  @Column({ type: 'datetime', nullable: true })
  @ApiProperty({ description: 'Leave time' })
  leftAt: Date | null;

  @Column({ default: 0 })
  @ApiProperty({ description: 'Duration in seconds' })
  duration: number;

  @Column({ default: false })
  @ApiProperty({ description: 'Whether was muted at any point' })
  wasMuted: boolean;

  @Column({ default: false })
  @ApiProperty({ description: 'Whether shared screen' })
  sharedScreen: boolean;
}
