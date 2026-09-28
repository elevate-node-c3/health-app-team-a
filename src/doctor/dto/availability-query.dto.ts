import { IsOptional, IsUUID, Matches } from 'class-validator';

export class AvailabilityQueryDto {
  /**
   * Which of the doctor's clinics to show times for. Required, because both the
   * hours and the fee belong to the doctor-clinic pairing rather than to the
   * doctor.
   */
  @IsUUID()
  clinicId!: string;

  /** Calendar month to return, 'YYYY-MM'. Defaults to the clinic's current month. */
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'month must be formatted as YYYY-MM',
  })
  month?: string;
}
