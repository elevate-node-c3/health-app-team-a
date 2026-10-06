import { MedicalQuestion } from 'src/medical-question/domain/entities/medical-question.model';
import { MedicalQuestionOrmEntity } from 'src/medical-question/infrastructure/entities/typeorm/medical-question.entity';

export class MedicalQuestionMapper {
  static toDomain(ormEntity: MedicalQuestionOrmEntity): MedicalQuestion {
    return new MedicalQuestion(
      ormEntity.id,
      ormEntity.userId,
      ormEntity.concern,
      ormEntity.symptoms,
      ormEntity.gender,
      ormEntity.age,
      ormEntity.isEmergency,
      ormEntity.status,
      ormEntity.askedAt,
      ormEntity.escalatedAt,
      ormEntity.notifiedAt,
      ormEntity.answerText,
      ormEntity.answeredAt,
      ormEntity.deletedAt,
      ormEntity.createdAt,
      ormEntity.updatedAt,
    );
  }
}
