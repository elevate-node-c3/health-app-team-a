import { Gender } from 'src/auth/domain/enums/user.enum';
import { MedicalQuestion } from 'src/medical-question/domain/entities/medical-question.model';
import { MedicalQuestionStatus } from 'src/medical-question/domain/enums/medical-question-status.enum';

export interface CreateMedicalQuestionInput {
  userId: string;
  concern: string;
  symptoms: string;
  gender: Gender;
  age: number;
  isEmergency: boolean;
  status: MedicalQuestionStatus;
  askedAt: Date;
  answerText: string | null;
  answeredAt: Date | null;
}

/**
 * Everything the medical-question flow needs from storage. A guest never
 * reaches this interface — ownership is enforced here, at the repository
 * boundary, the same way `AppointmentRepository.findByIdForUser` does.
 */
export interface MedicalQuestionRepository {
  create(input: CreateMedicalQuestionInput): Promise<MedicalQuestion>;

  findByIdForUser(id: string, userId: string): Promise<MedicalQuestion | null>;

  findPageForUser(
    userId: string,
    page: number,
    limit: number,
  ): Promise<[MedicalQuestion[], number]>;

  /** Returns `true` if a row owned by `userId` was soft-deleted just now. */
  softDelete(id: string, userId: string): Promise<boolean>;

  /**
   * Records the doctor's answer. Returns `null` — rather than throwing — when
   * the question is already answered or has been deleted, so a redelivered
   * message or a late answer to a deleted question is a harmless no-op and
   * not mistaken for the "question does not exist at all" case the caller
   * must still be able to detect and treat as a real integration failure.
   */
  markAnswered(
    questionId: string,
    answerText: string,
    answeredAt: Date,
  ): Promise<MedicalQuestion | null>;

  exists(id: string): Promise<boolean>;

  /**
   * Atomically claims and marks ESCALATED a batch of questions still PENDING
   * `thresholdAt` after being asked, returning the rows claimed so the caller
   * can emit one event per row.
   */
  sweepEscalations(
    thresholdAt: Date,
    limit: number,
  ): Promise<MedicalQuestion[]>;

  /**
   * Atomically claims a batch of still-unanswered questions that have not yet
   * been notified, `thresholdAt` after being asked, and stamps `notifiedAt`.
   * Deliberately independent of `status`/escalation, so a missed or delayed
   * escalation sweep can never suppress this milestone.
   */
  sweepNotifications(
    thresholdAt: Date,
    limit: number,
  ): Promise<MedicalQuestion[]>;
}

export const MEDICAL_QUESTION_REPOSITORY = Symbol(
  'MEDICAL_QUESTION_REPOSITORY',
);
