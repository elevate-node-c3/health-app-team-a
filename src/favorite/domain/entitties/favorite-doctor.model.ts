export class FavoriteDoctor {
  constructor(
    public readonly id: string,
    public readonly userID: string,
    public readonly doctorID: string,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}
}
