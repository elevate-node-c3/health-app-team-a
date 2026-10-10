import { UserOrmEntity } from 'src/auth/infrastructure/entities/typeorm/user.entity';
import { NotificationType } from 'src/notification/domain/enums/notification-type.enum';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import type { NotificationData } from 'src/notification/domain/entities/notification.model';

@Entity('notifications')
@Index('IDX_notifications_event_user', ['eventId', 'userId'], { unique: true })
@Index('IDX_notifications_user_created', ['userId', 'createdAt'])
@Index('IDX_notifications_user_unread', ['userId'], {
  where: `"readAt" IS NULL`,
})
export class NotificationOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  userId!: string;

  @ManyToOne(() => UserOrmEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: UserOrmEntity;

  @Column('uuid')
  eventId!: string;

  @Column({ type: 'varchar', enum: NotificationType })
  type!: NotificationType;

  @Column()
  title!: string;

  @Column()
  body!: string;

  @Column({ type: 'jsonb', default: {} })
  data!: NotificationData;

  @Column({ type: 'timestamptz', nullable: true })
  readAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
