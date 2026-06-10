import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { RoomHistory } from './room-history.entity';

@Entity('recordings')
export class RecordingLog {
  @PrimaryGeneratedColumn('uuid')
  @ApiProperty({ description: 'Database record ID' })
  id: string;

  @Column({ unique: true })
  @ApiProperty({ description: 'Recording ID' })
  recordingId: string;

  @Column()
  @ApiProperty({ description: 'Room ID' })
  roomId: string;

  @ManyToOne(() => RoomHistory, room => room.recordings)
  @JoinColumn({ name: 'roomId', referencedColumnName: 'roomId' })
  room: RoomHistory;

  @Column()
  @ApiProperty({ description: 'Initiator participant ID' })
  startedBy: string;

  @CreateDateColumn()
  @ApiProperty({ description: 'Recording start time' })
  startedAt: Date;

  @Column({ type: 'datetime', nullable: true })
  @ApiProperty({ description: 'Recording stop time' })
  stoppedAt: Date | null;

  @Column({ type: 'int', default: 0 })
  @ApiProperty({ description: 'Recording duration in seconds' })
  duration: number;

  @Column({ default: 'recording' })
  @ApiProperty({ description: 'Recording status: recording | stopped | failed' })
  status: string;

  @Column({ nullable: true })
  @ApiProperty({ description: 'Recording file URL (simulated)' })
  recordingUrl: string | null;
}
