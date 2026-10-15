import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppointmentModule } from 'src/appointment/appointment.module';
import { AuthModule } from 'src/auth/auth.module';
import { DoctorModule } from 'src/doctor/doctor.module';

import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AI_REPOSITORY } from './domain/repositories/ai.repository';
import { AI_UNIT_OF_WORK } from './domain/repositories/unit-of-work';
import { AI_PROVIDER } from './domain/services/ai-provider.port';
import { AiConversationOrmEntity } from './infrastructure/entities/typeorm/ai-conversation.entity';
import { AiMessageOrmEntity } from './infrastructure/entities/typeorm/ai-message.entity';
import { TypeOrmAiRepository } from './infrastructure/repositories/typeorm-ai.repository';
import { AiCleanupService } from './infrastructure/services/ai-cleanup.service';
import { AiGenerationErrorHandler } from './infrastructure/services/ai-generation-error.handler';
import { ChatCompletionsAiProviderAdapter } from './infrastructure/services/chat-completions-ai-provider.adapter';
import { AiConversationUnitOfWork } from './infrastructure/unit-of-work/ai-conversation-unit-of-work';

@Module({
  imports: [
    AuthModule,
    DoctorModule,
    AppointmentModule,
    TypeOrmModule.forFeature([AiConversationOrmEntity, AiMessageOrmEntity]),
  ],
  controllers: [AiController],
  providers: [
    AiService,
    AiCleanupService,
    AiGenerationErrorHandler,
    { provide: AI_REPOSITORY, useClass: TypeOrmAiRepository },
    { provide: AI_UNIT_OF_WORK, useClass: AiConversationUnitOfWork },
    { provide: AI_PROVIDER, useClass: ChatCompletionsAiProviderAdapter },
  ],
})
export class AiModule {}
