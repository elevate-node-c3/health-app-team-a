import { IntersectionType, PickType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, Max, Min } from 'class-validator';

import { SearchQueryDto } from './search-query.dto';

/**
 * The map's currently visible geographic region plus the (optional) user
 * location. In Map View the bounds are the authoritative region — the original
 * `governorate`/`city` text filters are intentionally NOT reused (see
 * {@link MapSearchQueryDto}) so "Search This Area" always follows the map.
 */
export class MapBoundsDto {
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  neLat!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  neLng!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  swLat!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  swLng!: number;

  // Optional user location. The range checks are the sanity check for obviously
  // invalid coordinates: technically-valid-but-far coordinates are accepted and
  // distance is computed normally; when absent, distance is omitted entirely.
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  userLat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  userLng?: number;
}

/**
 * Map View reuses the exact same non-geographic filters as the list search
 * (Map View is another representation of the same search), combined with the
 * map bounds. `governorate`/`city`/`page`/`sortBy`/`sortOrder` are deliberately
 * excluded: the bounds define the region, and ranking/cap are fixed server-side.
 */
export class MapSearchQueryDto extends IntersectionType(
  MapBoundsDto,
  PickType(SearchQueryDto, [
    'query',
    'genders',
    'availability',
    'places',
    'titles',
    'specialty',
    'minPrice',
    'maxPrice',
    'rating',
  ] as const),
) {}
