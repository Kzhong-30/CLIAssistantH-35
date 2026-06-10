import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as path from 'path';
import * as fs from 'fs';

import { RedisModule } from './modules/redis/redis.module';
import { RoomController } from './controllers/room.controller';
import { SignalingGateway } from './gateways/signaling.gateway';
import { RoomStateService } from './services/room-state.service';
import { HistoryService } from './services/history.service';

import { RoomHistory } from './entities/room-history.entity';
import { ParticipantHistory } from './entities/participant-history.entity';
import { ChatMessage } from './entities/chat-message.entity';
import { RecordingLog } from './entities/recording-log.entity';

const dbDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

@Module({
  imports: [
    RedisModule,
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: path.resolve(dbDir, 'video-conference.db'),
      entities: [RoomHistory, ParticipantHistory, ChatMessage, RecordingLog],
      synchronize: true,
      logging: false,
    }),
    TypeOrmModule.forFeature([RoomHistory, ParticipantHistory, ChatMessage, RecordingLog]),
  ],
  controllers: [RoomController],
  providers: [RoomStateService, HistoryService, SignalingGateway],
})
export class AppModule {}
