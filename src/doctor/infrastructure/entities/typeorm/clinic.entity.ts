import { PlaceType } from 'src/doctor/domain/enums/place-type.enum';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('clinics')
export class ClinicOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column({ type: 'varchar', enum: PlaceType })
  placeType!: PlaceType;

  @Column()
  governorate!: string;

  @Column()
  city!: string;

  @Column({ type: 'decimal', precision: 9, scale: 6 })
  latitude!: number;

  @Column({ type: 'decimal', precision: 9, scale: 6 })
  longitude!: number;

  @Column({ default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
