import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Gender } from 'src/auth/domain/enums/user.enum';
import {
  MAX_AGE,
  MAX_CONCERN_LENGTH,
  MAX_SYMPTOMS_LENGTH,
  MIN_AGE,
} from 'src/medical-question/medical-question.constants';

export class AskMedicalQuestionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_CONCERN_LENGTH)
  concern!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_SYMPTOMS_LENGTH)
  symptoms!: string;

  @IsEnum(Gender)
  gender!: Gender;

  @IsInt()
  @Min(MIN_AGE)
  @Max(MAX_AGE)
  age!: number;

  @IsBoolean()
  isEmergency!: boolean;
}
