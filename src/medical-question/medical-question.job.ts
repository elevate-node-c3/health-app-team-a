import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import { MedicalQuestionService } from './medical-question.service';

const SWEEP_INTERVAL_MS = 5 * 60_000;

@Injectable()
export class MedicalQuestionWindowJob {
  constructor(
    private readonly medicalQuestionService: MedicalQuestionService,
  ) {}

  @Interval(SWEEP_INTERVAL_MS)
  async escalate(): Promise<void> {
    await this.medicalQuestionService.reapEscalations();
  }

  @Interval(SWEEP_INTERVAL_MS)
  async notify(): Promise<void> {
    await this.medicalQuestionService.reapNotifications();
  }
}
