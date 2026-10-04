import { IsISO8601, IsUUID, Matches } from 'class-validator';

export class CreateSlotHoldDto {
  @IsUUID()
  doctorId!: string;

  @IsUUID()
  clinicId!: string;

  /**
   * The instant to hold, as an unambiguous UTC time. The `Z` is required: an
   * offset-less string would be read against the server's own zone, so the same
   * request would book a different instant depending on where the process runs.
   *
   * Whether the instant sits on the doctor's slot grid is deliberately not
   * checked here — `slotMinutes` is per schedule row, so only `findOfferedSlot`
   * can answer it, and it does.
   */
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/, {
    message:
      'scheduledAt must be a UTC instant ending in Z, e.g. 2026-10-04T07:00:00Z',
  })
  scheduledAt!: string;
}
