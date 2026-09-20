import { Type, Transform } from 'class-transformer';
import {
  IsString,
  Length,
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
  Max,
  IsArray,
  IsIn,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { Gender } from 'src/auth/domain/enums/user.enum';
import { DoctorTitle } from 'src/doctor/domain/enums/doctor-title.enum';
import { PlaceType } from 'src/doctor/domain/enums/place-type.enum';

const EGYPT_LOCATIONS: Record<string, string[]> = {
  Cairo: ['Nasr City', 'Maadi', 'Heliopolis', 'New Cairo', 'Zamalek'],
  Alexandria: ['Smouha', 'Miami', 'Gleam', 'Agami', 'Sidi Gaber'],
  Giza: ['Dokki', 'Mohandeseen', 'Sheikh Zayed', '6th of October'],
};

@ValidatorConstraint({ name: 'isCityBelongsToGovernorate', async: false })
export class IsCityBelongsToGovernorateConstraint implements ValidatorConstraintInterface {
  validate(city: string, args: ValidationArguments) {
    const object = args.object as Record<string, unknown>;
    const governorate = object.governorate as string | undefined;
    if (!governorate) return true; // If no governorate is selected, we can't validate city belonging
    const validCities = EGYPT_LOCATIONS[governorate];
    if (!validCities) return false;
    return validCities.includes(city);
  }

  defaultMessage() {
    return 'city must belong to the chosen governorate';
  }
}

export class SearchQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(2, 500)
  query?: string;

  @IsOptional()
  @IsArray()
  @IsEnum(Gender, { each: true })
  @Transform(
    ({ value }: { value: unknown }) =>
      (Array.isArray(value) ? value : [value]) as unknown[],
  )
  genders?: Gender[];

  @IsOptional()
  @IsArray()
  @IsIn(['Any Day', 'Today', 'Tomorrow'], { each: true })
  @Transform(
    ({ value }: { value: unknown }) =>
      (Array.isArray(value) ? value : [value]) as unknown[],
  )
  availability?: string[];

  @IsOptional()
  @IsArray()
  @IsEnum(PlaceType, { each: true })
  @Transform(
    ({ value }: { value: unknown }) =>
      (Array.isArray(value) ? value : [value]) as unknown[],
  )
  places?: PlaceType[];

  @IsOptional()
  @IsArray()
  @IsEnum(DoctorTitle, { each: true })
  @Transform(
    ({ value }: { value: unknown }) =>
      (Array.isArray(value) ? value : [value]) as unknown[],
  )
  titles?: DoctorTitle[];

  @IsOptional()
  @IsString()
  governorate?: string;

  @IsOptional()
  @IsString()
  @Validate(IsCityBelongsToGovernorateConstraint)
  city?: string;

  @IsOptional()
  @IsString()
  specialty?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1000)
  maxPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 10;

  @IsOptional()
  @IsString()
  @IsIn(['rating', 'price', 'experience'])
  sortBy?: string = 'rating';

  @IsOptional()
  @IsString()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC' = 'DESC';
}
