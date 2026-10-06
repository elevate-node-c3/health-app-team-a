import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';
import { DoctorModule } from 'src/doctor/doctor.module';

import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AI_REPOSITORY } from './domain/repositories/ai.repository';
import { AI_UNIT_OF_WORK } from './domain/repositories/unit-of-work';
import { AI_PROVIDER } from './domain/services/ai-provider.port';
import {
  AiConversationOrmEntity,
  AiMessageOrmEntity,
} from './infrastructure/entities/typeorm/ai.entity';
import { TypeOrmAiRepository } from './infrastructure/repositories/typeorm-ai.repository';
import { ChatCompletionsAiProviderAdapter } from './infrastructure/services/chat-completions-ai-provider.adapter';
import { TypeOrmAiUnitOfWork } from './infrastructure/unit-of-work/typeorm-unit-of-work';

@Module({
  imports: [
    AuthModule,
    DoctorModule,
    TypeOrmModule.forFeature([AiConversationOrmEntity, AiMessageOrmEntity]),
  ],
  controllers: [AiController],
  providers: [
    AiService,
    { provide: AI_REPOSITORY, useClass: TypeOrmAiRepository },
    { provide: AI_UNIT_OF_WORK, useClass: TypeOrmAiUnitOfWork },
    { provide: AI_PROVIDER, useClass: ChatCompletionsAiProviderAdapter },
  ],
})
export class AiModule {}
