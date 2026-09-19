import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { APPOINTMENT_REPOSITORY } from 'src/appointment/domain/repositories/appointment.repository';
import { ArticleService } from 'src/article/article.service';
import { User } from 'src/auth/domain/entities/user.model';
import { DOCTOR_REPOSITORY } from 'src/doctor/domain/repositories/doctor.repository';
import { SPECIALTY_REPOSITORY } from 'src/doctor/domain/repositories/specialty.repository';
import { FAVOURITE_REPOSITORY } from 'src/favourite/domain/repositories/favourite.repository';
import { RedisService } from 'src/infrastructure/cache/redis.service';

import { HOME_OPENED_EVENT, HomeOpenedEvent } from './home.events';
import {
  AppointmentCardResponse,
  HomePublicBlock,
  HomeResponse,
  TopDoctorCard,
} from './home.types';

import type {
  AppointmentCard,
  AppointmentRepository,
} from 'src/appointment/domain/repositories/appointment.repository';
import type {
  VisibleDoctor,
  DoctorRepository,
} from 'src/doctor/domain/repositories/doctor.repository';
import type { SpecialtyRepository } from 'src/doctor/domain/repositories/specialty.repository';
import type { FavouriteRepository } from 'src/favourite/domain/repositories/favourite.repository';

const HOME_PUBLIC_CACHE_KEY = 'home:public:v1';

/** TTL (ms) for the cached public Home block. */
const PUBLIC_CACHE_TTL_MS = 120_000;
/** How many ranked doctors the Top Doctors section returns. */
const TOP_DOCTORS_LIMIT = 10;
/** How many newest published articles the Home teaser returns. */
const ARTICLES_TEASER_LIMIT = 5;
/** A completed appointment counts as a "recent visit" within this window. */
const RECENT_VISIT_WINDOW_DAYS = 30;

@Injectable()
export class HomeService {
  constructor(
    @Inject(SPECIALTY_REPOSITORY)
    private readonly specialtyRepository: SpecialtyRepository,
    @Inject(DOCTOR_REPOSITORY)
    private readonly doctorRepository: DoctorRepository,
    @Inject(APPOINTMENT_REPOSITORY)
    private readonly appointmentRepository: AppointmentRepository,
    @Inject(FAVOURITE_REPOSITORY)
    private readonly favouriteRepository: FavouriteRepository,
    private readonly articleService: ArticleService,
    private readonly cache: RedisService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /** Assembles the whole Home screen in one call. */
  async getHome(
    user: User | null,
    now: Date = new Date(),
  ): Promise<HomeResponse> {
    // Fire-and-forget analytics — the listener runs asynchronously.
    this.eventEmitter.emit(HOME_OPENED_EVENT, {
      userId: user?.id ?? null,
      at: now,
    } satisfies HomeOpenedEvent);

    const publicBlock = await this.getPublicBlock();

    if (!user) {
      // Guest: public block as-is, no user name, no personal sections. The
      // client renders the greeting copy.
      return { ...publicBlock };
    }

    const [favouritedIds, upcoming, recent] = await Promise.all([
      this.favouriteRepository.findFavouritedDoctorIds(
        user.id,
        publicBlock.topDoctors.map((card) => card.id),
      ),
      this.appointmentRepository.findNextUpcoming(user.id, now),
      this.appointmentRepository.findMostRecentVisit(
        user.id,
        now,
        RECENT_VISIT_WINDOW_DAYS,
      ),
    ]);

    const response: HomeResponse = {
      userName: user.name,
      ...publicBlock,
      // Stamp favourite state onto fresh card copies — never mutate the cache.
      topDoctors: publicBlock.topDoctors.map((card) => ({
        ...card,
        isFavourite: favouritedIds.has(card.id),
      })),
    };

    // Omit personal sections entirely when there is no data.
    if (upcoming)
      response.upcomingAppointment = this.toAppointmentCard(upcoming);
    if (recent) response.recentVisit = this.toAppointmentCard(recent);

    return response;
  }

  private async getPublicBlock(): Promise<HomePublicBlock> {
    const cached = await this.cache.get<HomePublicBlock>(HOME_PUBLIC_CACHE_KEY);
    if (cached) return cached;

    const homePublicBlock = await this.buildPublicBlock();
    await this.cache.set(
      HOME_PUBLIC_CACHE_KEY,
      homePublicBlock,
      PUBLIC_CACHE_TTL_MS,
    );
    return homePublicBlock;
  }

  private async buildPublicBlock(): Promise<HomePublicBlock> {
    const [specialties, topDoctors, articles] = await Promise.all([
      this.specialtyRepository.findAll(),
      this.doctorRepository.findTopRanked(TOP_DOCTORS_LIMIT),
      this.articleService.newestTeasers(ARTICLES_TEASER_LIMIT),
    ]);

    const specialtyNameById = new Map(
      specialties.map((specialty) => [specialty.id, specialty.name]),
    );

    return {
      categories: specialties.map((specialty) => ({
        id: specialty.id,
        name: specialty.name,
      })),
      topDoctors: topDoctors.map((visible) =>
        this.toDoctorCard(visible, specialtyNameById),
      ),
      articles,
    };
  }

  private toDoctorCard(
    visible: VisibleDoctor,
    specialtyNameById: Map<string, string>,
  ): TopDoctorCard {
    const { doctor, cardPrice } = visible;
    return {
      id: doctor.id,
      name: doctor.name,
      photo: doctor.photo,
      specialty: specialtyNameById.get(doctor.specialtyId) ?? '',
      rating: doctor.hasRatings
        ? { average: doctor.ratingAverage, count: doctor.ratingCount }
        : null,
      fee: cardPrice,
      feeCurrency: 'EGP',
    };
  }

  private toAppointmentCard(card: AppointmentCard): AppointmentCardResponse {
    return {
      id: card.id,
      scheduledAt: card.scheduledAt,
      doctor: {
        id: card.doctorId,
        name: card.doctorName,
        photo: card.doctorPhoto,
        specialty: card.specialtyName,
      },
      clinicName: card.clinicName,
    };
  }
}
