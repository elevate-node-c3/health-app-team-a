export interface CategoryChip {
  id: string;
  name: string;
}

export interface DoctorRating {
  average: number;
  count: number;
}

export interface TopDoctorCard {
  id: string;
  name: string;
  photo: string | null;
  specialty: string;
  rating: DoctorRating | null;
  fee: number | null;
  feeCurrency: 'EGP';
  /** Present only for signed-in users. */
  isFavourite?: boolean;
}

export interface AppointmentCardResponse {
  id: string;
  scheduledAt: Date;
  doctor: {
    id: string;
    name: string;
    photo: string | null;
    specialty: string;
  };
  clinicName: string | null;
}

export interface ArticleTeaserCard {
  id: string;
  title: string;
  excerpt: string;
  coverImage: string | null;
  publishedAt: Date | null;
  authorName: string;
}

/** The shared, cacheable half of Home. */
export interface HomePublicBlock {
  categories: CategoryChip[];
  topDoctors: TopDoctorCard[];
  articles: ArticleTeaserCard[];
}

/** The assembled Home payload returned by GET /home. */
export interface HomeResponse extends HomePublicBlock {
  /** The signed-in user's name; omitted for guests. */
  userName?: string;
  upcomingAppointment?: AppointmentCardResponse;
  recentVisit?: AppointmentCardResponse;
}
