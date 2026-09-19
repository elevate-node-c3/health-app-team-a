import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('articles')
@Index(['isPublished', 'publishedAt'])
export class ArticleOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  title!: string;

  @Column({ unique: true })
  slug!: string;

  @Column()
  excerpt!: string;

  @Column({ type: 'text' })
  body!: string;

  @Column({ type: 'varchar', nullable: true })
  coverImage!: string | null;

  @Column({ default: false })
  isPublished!: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

  @Column()
  authorName!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
