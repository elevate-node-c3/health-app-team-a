export class Favourite {
  constructor(
    public readonly userId: string,
    public readonly doctorId: string,
    public readonly createdAt: Date,
  ) {}
}
