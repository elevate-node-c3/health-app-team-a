export interface FavouriteRepository {
  /**
   * Which of the given doctors the user has favourited.
   */
  findFavouritedDoctorIds(
    userId: string,
    doctorIds: string[],
  ): Promise<Set<string>>;

  /** Idempotently favourite a doctor for a user. */
  add(userId: string, doctorId: string): Promise<void>;

  /** Remove a favourite; a no-op if it was not present. */
  remove(userId: string, doctorId: string): Promise<void>;

  /** Whether the user currently favourites the doctor. */
  exists(userId: string, doctorId: string): Promise<boolean>;
}

export const FAVOURITE_REPOSITORY = Symbol('FAVOURITE_REPOSITORY');
