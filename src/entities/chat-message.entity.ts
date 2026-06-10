import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { RoomHistory } from './room-history.entity';

@Entity('chat_messages')
export class ChatMessage {
  @PrimaryGeneratedColumn('uuid')
  @ApiProperty({ description: 'Database record ID' })
  id: string;

  @Column()
  @ApiProperty({ description: 'Room ID' })
  roomId: string;

  @ManyToOne(() => RoomHistory, room => room.messages)
  @JoinColumn({ name: 'roomId', referencedColumnName: 'roomId' })
  room: RoomHistory;

  @Column()
  @ApiProperty({ description: 'Sender participant ID' })
  senderId: string;

  @Column()
  @ApiProperty({ description: 'Sender name' })
  senderName: string;

  @Column('text')
  @ApiProperty({ description: 'Message content' })
  content: string;

  @CreateDateColumn()
  @ApiProperty({ description: 'Message timestamp' })
  timestamp: Date;
}
