import { IsDateString } from 'class-validator';

export class CreateReplacementHoldDto {
  @IsDateString()
  scheduledAt!: string;
}
