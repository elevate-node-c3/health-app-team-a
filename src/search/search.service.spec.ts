import { jest } from '@jest/globals';
import { DoctorTitle } from 'src/doctor/domain/enums/doctor-title.enum';
import { PlaceType } from 'src/doctor/domain/enums/place-type.enum';

import { MapClinicResult } from './domain/entities/map-clinic-result.model';
import { MapSearchQueryDto } from './dto/map-search-query.dto';
import { MAP_SEARCH_MAX_RESULTS } from './map-search.constants';
import { MAP_REGION_SEARCHED_EVENT } from './map-search.events';
import { SearchService } from './search.service';

import type {
  MapSearchFilter,
  SearchRepository,
} from './domain/repositories/search.repository';

function makeRow(
  overrides: Partial<{
    doctorClinicId: string;
    clinicId: string;
    doctorId: string;
    distanceMeters: number | null;
    ratingCount: number;
  }> = {},
): MapClinicResult {
  return new MapClinicResult(
    overrides.doctorClinicId ?? 'dc-1',
    overrides.clinicId ?? 'clinic-1',
    'Nile Clinic',
    PlaceType.CLINIC,
    'Cairo',
    'Maadi',
    30.06,
    31.25,
    overrides.doctorId ?? 'doc-1',
    'Dr. Ahmed',
    null,
    DoctorTitle.SPECIALIST,
    'Cardiology',
    4.6,
    overrides.ratingCount ?? 12,
    250,
    overrides.distanceMeters === undefined ? 1830 : overrides.distanceMeters,
  );
}

function makeDto(
  overrides: Partial<MapSearchQueryDto> = {},
): MapSearchQueryDto {
  return {
    neLat: 30.1,
    neLng: 31.3,
    swLat: 30.0,
    swLng: 31.2,
    ...overrides,
  };
}

describe('SearchService.searchMap', () => {
  let searchRepository: {
    searchMap: jest.Mock<
      (
        f: MapSearchFilter,
      ) => Promise<{ rows: MapClinicResult[]; total: number }>
    >;
  };
  let eventEmitter: { emit: jest.Mock };
  let service: SearchService;

  beforeEach(() => {
    searchRepository = { searchMap: jest.fn() };
    eventEmitter = { emit: jest.fn() };
    service = new SearchService(
      searchRepository as unknown as SearchRepository,
      {} as never,
      {} as never,
      eventEmitter as never,
    );
  });

  it('omits distances and reports hasDistance:false when no user location is shared', async () => {
    searchRepository.searchMap.mockResolvedValue({
      rows: [makeRow({ distanceMeters: null })],
      total: 1,
    });

    const result = await service.searchMap(makeDto(), { deviceId: 'device-1' });

    expect(result.data[0].distanceMeters).toBeNull();
    expect(result.meta.hasDistance).toBe(false);
    // The cap is always forwarded; user coordinates are absent.
    const filter = searchRepository.searchMap.mock.calls[0][0];
    expect(filter.limit).toBe(MAP_SEARCH_MAX_RESULTS);
    expect(filter.userLat).toBeUndefined();
    expect(filter.userLng).toBeUndefined();
  });

  it('returns real distances and forwards user location when shared', async () => {
    searchRepository.searchMap.mockResolvedValue({
      rows: [makeRow({ distanceMeters: 1830 })],
      total: 1,
    });

    const result = await service.searchMap(
      makeDto({ userLat: 30.05, userLng: 31.24 }),
      { deviceId: 'device-1' },
    );

    expect(result.data[0].distanceMeters).toBe(1830);
    expect(result.meta.hasDistance).toBe(true);
    const filter = searchRepository.searchMap.mock.calls[0][0];
    expect(filter.userLat).toBe(30.05);
    expect(filter.userLng).toBe(31.24);
  });

  it('flags meta.limited when total exceeds the returned rows', async () => {
    const rows = Array.from({ length: MAP_SEARCH_MAX_RESULTS }, (_, i) =>
      makeRow({ doctorClinicId: `dc-${i}`, clinicId: `clinic-${i}` }),
    );
    searchRepository.searchMap.mockResolvedValue({ rows, total: 350 });

    const result = await service.searchMap(makeDto(), { deviceId: 'device-1' });

    expect(result.meta.returned).toBe(MAP_SEARCH_MAX_RESULTS);
    expect(result.meta.total).toBe(350);
    expect(result.meta.limited).toBe(true);
  });

  it('maps a doctor at two clinics to two items with distinct keys', async () => {
    searchRepository.searchMap.mockResolvedValue({
      rows: [
        makeRow({
          doctorClinicId: 'dc-A',
          clinicId: 'clinic-A',
          doctorId: 'doc-1',
        }),
        makeRow({
          doctorClinicId: 'dc-B',
          clinicId: 'clinic-B',
          doctorId: 'doc-1',
        }),
      ],
      total: 2,
    });

    const result = await service.searchMap(makeDto(), { deviceId: 'device-1' });

    expect(result.data).toHaveLength(2);
    expect(result.data.map((i) => i.doctorClinicId)).toEqual(['dc-A', 'dc-B']);
    expect(result.data.map((i) => i.clinic.id)).toEqual([
      'clinic-A',
      'clinic-B',
    ]);
    expect(result.data[0].doctor.id).toBe(result.data[1].doctor.id);
  });

  it('emits MapRegionSearched once with the bounds, counts and location flag', async () => {
    searchRepository.searchMap.mockResolvedValue({
      rows: [
        makeRow(),
        makeRow({ doctorClinicId: 'dc-2', clinicId: 'clinic-2' }),
      ],
      total: 5,
    });

    await service.searchMap(makeDto({ userLat: 30.05, userLng: 31.24 }), {
      deviceId: 'device-1',
      userId: 'user-1',
    });

    expect(eventEmitter.emit).toHaveBeenCalledTimes(1);
    const [eventName, payload] = eventEmitter.emit.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(eventName).toBe(MAP_REGION_SEARCHED_EVENT);
    expect(payload).toMatchObject({
      userId: 'user-1',
      deviceId: 'device-1',
      bounds: { neLat: 30.1, neLng: 31.3, swLat: 30.0, swLng: 31.2 },
      hasLocation: true,
      resultCount: 2,
      total: 5,
    });
  });

  it('nulls the rating when the doctor has no ratings', async () => {
    searchRepository.searchMap.mockResolvedValue({
      rows: [makeRow({ ratingCount: 0 })],
      total: 1,
    });

    const result = await service.searchMap(makeDto(), { deviceId: 'device-1' });

    expect(result.data[0].doctor.rating).toBeNull();
  });
});
