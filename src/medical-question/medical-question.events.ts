/** ISO instants — every event payload carries dates as strings on the wire. */
export interface MedicalQuestionAskedEvent {
  questionId: string;
  userId: string;
  isEmergency: boolean;
  askedAt: string;
}

export interface MedicalQuestionAnsweredEvent {
  questionId: string;
  userId: string;
  answeredAt: string;
}

export type QuestionAnswerWindowBreachStage = 'escalated' | 'patient_notified';

export interface QuestionAnswerWindowBreachedEvent {
  questionId: string;
  userId: string;
  askedAt: string;
  stage: QuestionAnswerWindowBreachStage;
  at: string;
}
