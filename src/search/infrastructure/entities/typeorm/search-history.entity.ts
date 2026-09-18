import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('search_histories')
@Index(['ownerKey', 'normalizedTerm'], { unique: true })
@Index(['ownerKey', 'createdAt'])
export class SearchHistoryOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  ownerKey!: string;

  @Column({ length: 500 })
  term!: string;

  @Column({ length: 500 })
  normalizedTerm!: string;

  @Column({ type: 'timestamp' })
  createdAt!: Date;
}
