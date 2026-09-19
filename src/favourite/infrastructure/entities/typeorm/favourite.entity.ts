import { UserOrmEntity } from 'src/auth/infrastructure/entities/typeorm/user.entity';
import { DoctorOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/doctor.entity';
import {
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';

@Entity('favourites')
export class FavouriteOrmEntity {
  @PrimaryColumn('uuid')
  userId!: string;

  @ManyToOne(() => UserOrmEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: UserOrmEntity;

  @PrimaryColumn('uuid')
  doctorId!: string;

  @ManyToOne(() => DoctorOrmEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'doctorId' })
  doctor!: DoctorOrmEntity;

  @CreateDateColumn()
  createdAt!: Date;
}
