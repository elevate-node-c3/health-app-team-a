import { Gender } from 'src/auth/domain/enums/user.enum';
import { MedicalQuestionStatus } from 'src/medical-question/domain/enums/medical-question-status.enum';

export class MedicalQuestion {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly concern: string,
    public readonly symptoms: string,
    public readonly gender: Gender,
    public readonly age: number,
    public readonly isEmergency: boolean,
    public status: MedicalQuestionStatus,
    public readonly askedAt: Date,
    public escalatedAt: Date | null,
    public notifiedAt: Date | null,
    public answerText: string | null,
    public answeredAt: Date | null,
    public deletedAt: Date | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  get isAnswered(): boolean {
    return this.answeredAt !== null;
  }
}
