import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';
import { MessagingModule } from 'src/infrastructure/messaging/messaging.module';

import { MEDICAL_QUESTION_REPOSITORY } from './domain/repositories/medical-question.repository';
import { MedicalQuestionOrmEntity } from './infrastructure/entities/typeorm/medical-question.entity';
import { TypeOrmMedicalQuestionRepository } from './infrastructure/repositories/typeorm-medical-question.repository';
import { MedicalQuestionAnswerListener } from './medical-question-answer.listener';
import { MedicalQuestionController } from './medical-question.controller';
import { MedicalQuestionWindowJob } from './medical-question.job';
import { MedicalQuestionService } from './medical-question.service';

@Module({
  imports: [
    AuthModule,
    MessagingModule,
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([MedicalQuestionOrmEntity]),
  ],
  controllers: [MedicalQuestionController],
  providers: [
    MedicalQuestionService,
    MedicalQuestionWindowJob,
    MedicalQuestionAnswerListener,
    {
      provide: MEDICAL_QUESTION_REPOSITORY,
      useClass: TypeOrmMedicalQuestionRepository,
    },
  ],
  exports: [MEDICAL_QUESTION_REPOSITORY, MedicalQuestionService],
})
export class MedicalQuestionModule {}
