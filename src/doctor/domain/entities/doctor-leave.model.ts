export class DoctorLeave {
  constructor(
    public readonly id: string,
    public readonly doctorId: string,
    /** Inclusive first day off, 'YYYY-MM-DD'. Zoneless by design. */
    public startDate: string,
    /** Inclusive last day off, 'YYYY-MM-DD'. */
    public endDate: string,
    public reason: string | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  /**
   * Whether the given calendar date falls inside this leave. Both bounds are
   * inclusive, and the comparison is a plain string compare because ISO dates
   * sort lexicographically — no zone is involved in "which day is it".
   */
  covers(isoDate: string): boolean {
    return isoDate >= this.startDate && isoDate <= this.endDate;
  }
}
