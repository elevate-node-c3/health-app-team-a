import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export const APPOINTMENT_HISTORY_TABS = [
  'all',
  'upcoming',
  'completed',
  'cancelled',
] as const;

export type AppointmentHistoryTab = (typeof APPOINTMENT_HISTORY_TABS)[number];

export class AppointmentHistoryQueryDto {
  @IsOptional()
  @IsIn(APPOINTMENT_HISTORY_TABS)
  tab: AppointmentHistoryTab = 'all';

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
}
