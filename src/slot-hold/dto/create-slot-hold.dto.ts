import { IsISO8601, IsUUID, Matches } from 'class-validator';

export class CreateSlotHoldDto {
  @IsUUID()
  doctorId!: string;

  @IsUUID()
  clinicId!: string;

  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:(00|30):00(\.000)?Z$/, {
    message:
      'scheduledAt must be a UTC time on a 30-minute boundary, e.g. 2026-10-04T07:00:00Z',
  })
  scheduledAt!: string;
}
