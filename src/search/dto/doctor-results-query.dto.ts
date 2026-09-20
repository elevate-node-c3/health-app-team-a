import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

export class DoctorResultsQueryDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @Length(0, 500)
  query?: string;

  @IsOptional()
  @IsUUID()
  specialtyId?: string;

  @IsOptional()
  @IsIn(['recommended', 'price_asc', 'price_desc'])
  sort?: 'recommended' | 'price_asc' | 'price_desc';

  @IsOptional()
  @IsString()
  cursor?: string;

  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
}
