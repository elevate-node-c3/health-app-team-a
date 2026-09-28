import { IsDateString, IsUUID } from 'class-validator';

export class CreateBookingHoldDto {
  @IsUUID()
  doctorId!: string;

  @IsUUID()
  clinicId!: string;

  @IsDateString()
  scheduledAt!: string;
}
