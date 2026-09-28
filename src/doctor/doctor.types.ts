import { Gender } from 'src/auth/domain/enums/user.enum';
import { DoctorTitle } from 'src/doctor/domain/enums/doctor-title.enum';
import { PlaceType } from 'src/doctor/domain/enums/place-type.enum';
import { DoctorRating } from 'src/home/home.types';

/** One clinic a doctor can be booked at, as the profile screen shows it. */
export interface DoctorProfileClinic {
  doctorClinicId: string;
  id: string;
  name: string;
  placeType: PlaceType;
  governorate: string;
  city: string;
  latitude: number;
  longitude: number;
  /** The fee for THIS doctor at THIS clinic. */
  fee: number;
  feeCurrency: 'EGP';
  /** IANA zone this clinic's hours and returned times are expressed in. */
  timezone: string;
}

/** The bookable date window for one clinic, in that clinic's own zone. */
export interface BookingWindow {
  horizonDays: number;
  /** Inclusive first bookable date, 'YYYY-MM-DD'. */
  earliestDate: string;
  /** Inclusive last bookable date, 'YYYY-MM-DD'. */
  latestDate: string;
  timezone: string;
}

/** The payload returned by GET /doctors/:id. */
export interface DoctorProfileResponse {
  id: string;
  name: string;
  photo: string | null;
  title: DoctorTitle;
  specialty: string;
  subspecialties: string | null;
  university: string;
  yearsOfExperience: number;
  patientsCount: number;
  gender: Gender;
  rating: DoctorRating | null;
  clinics: DoctorProfileClinic[];
  /**
   * Only the horizon length lives here. The concrete date window depends on the
   * clinic's zone, so it belongs to the per-clinic availability response.
   */
  booking: { horizonDays: number };
  /** Present only for signed-in users. */
  isFavourite?: boolean;
}

/** One candidate appointment time. */
export interface AvailabilitySlot {
  /** The exact instant the appointment would start. */
  at: Date;
  /** The same instant on the clinic's own clock, 'HH:mm'. */
  localTime: string;
  durationMinutes: number;
  /** True when this time is booked or held. Taken slots are never omitted. */
  isTaken: boolean;
  /**
   * Set when the time is not booked but a live hold has it while someone pays.
   * Always accompanied by `isTaken` — it may free up again within minutes, but
   * right now it cannot be booked.
   */
  isHeld?: boolean;
  /**
   * Set when this slot exists only because a booking sits outside the current
   * recurring hours — the clinic changed its hours, or the slot length changed,
   * after the appointment was made.
   */
  isOffSchedule?: boolean;
}

/** One clinic-local calendar day of slots. */
export interface AvailabilityDay {
  /** 'YYYY-MM-DD' on the clinic's calendar. */
  date: string;
  /** 0 = Sunday … 6 = Saturday. */
  dayOfWeek: number;
  /** True when the doctor is on leave; any slots listed are existing bookings. */
  isOnLeave: boolean;
  slots: AvailabilitySlot[];
}

export interface AvailabilityMeta {
  doctorId: string;
  clinicId: string;
  /** The month this response covers, 'YYYY-MM'. */
  month: string;
  fee: number;
  feeCurrency: 'EGP';
  /** Every `date` and `localTime` in this response is in this zone. */
  timezone: string;
  /** When this snapshot was built. */
  generatedAt: Date;
  /** Refetch after this many seconds; the times may have moved on. */
  staleAfterSeconds: number;
  /**
   * Always false. This response reports what was free at `generatedAt` and
   * holds nothing — someone else may take any of these times a second later.
   */
  isReservation: false;
  booking: BookingWindow;
  /** Whether the month before this one has any bookable dates left. */
  canGoPrevious: boolean;
  /** Whether the month after this one falls inside the horizon. */
  canGoNext: boolean;
  totalSlots: number;
  availableSlots: number;
  takenSlots: number;
}

/** The payload returned by GET /doctors/:id/availability. */
export interface AvailabilityResponse {
  data: AvailabilityDay[];
  meta: AvailabilityMeta;
}
