import { PlaceType } from 'src/doctor/domain/enums/place-type.enum';

export class Clinic {
  constructor(
    public readonly id: string,
    public name: string,
    public placeType: PlaceType,
    public governorate: string,
    public city: string,
    public latitude: number,
    public longitude: number,
    public isActive: boolean,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}
}
