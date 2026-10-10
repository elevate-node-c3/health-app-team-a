import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AppointmentStatus } from 'src/appointment/domain/enums/appointment-status.enum';
import { AppointmentOrmEntity } from 'src/appointment/infrastructure/entities/typeorm/appointment.entity';
import { Notification } from 'src/notification/domain/entities/notification.model';
import { NotificationGroup } from 'src/notification/domain/enums/notification-group.enum';
import { NotificationOrmEntity } from 'src/notification/infrastructure/entities/typeorm/notification.entity';
import { NotificationMapper } from 'src/notification/infrastructure/mappers/notification.mapper';
import { IsNull, Repository } from 'typeorm';

import type {
  CreateNotificationInput,
  NotificationPage,
  NotificationRepository,
} from 'src/notification/domain/repositories/notification.repository';

@Injectable()
export class TypeOrmNotificationRepository implements NotificationRepository {
  constructor(
    @InjectRepository(NotificationOrmEntity)
    private readonly repo: Repository<NotificationOrmEntity>,
    @InjectRepository(AppointmentOrmEntity)
    private readonly appointmentRepo: Repository<AppointmentOrmEntity>,
  ) {}

  async createIfNew(
    input: CreateNotificationInput,
  ): Promise<Notification | null> {
    const result = await this.repo
      .createQueryBuilder()
      .insert()
      .into(NotificationOrmEntity)
      .values(input)
      .orIgnore()
      .returning('*')
      .execute();

    const rows = result.raw as NotificationOrmEntity[];
    return rows.length > 0 ? NotificationMapper.toDomain(rows[0]) : null;
  }

  async listForUser(
    userId: string,
    page: number,
    limit: number,
  ): Promise<NotificationPage> {
    const [rows, total] = await this.repo.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      items: rows.map((row) => NotificationMapper.toDomain(row)),
      total,
    };
  }

  async hasUnread(userId: string): Promise<boolean> {
    return this.repo.exists({ where: { userId, readAt: IsNull() } });
  }

  async countUnread(userId: string): Promise<number> {
    return this.repo.count({ where: { userId, readAt: IsNull() } });
  }

  async markGroupRead(
    userId: string,
    group: NotificationGroup,
    startOfToday: Date,
  ): Promise<number> {
    const comparison = group === NotificationGroup.NEWEST ? '>=' : '<';

    const result = await this.repo
      .createQueryBuilder()
      .update(NotificationOrmEntity)
      .set({ readAt: () => 'now()' })
      .where('"userId" = :userId', { userId })
      .andWhere('"readAt" IS NULL')
      .andWhere(`"createdAt" ${comparison} :startOfToday`, { startOfToday })
      .execute();

    return result.affected ?? 0;
  }

  async isReminderDue(
    appointmentId: string,
    scheduledAt: Date,
  ): Promise<boolean> {
    return this.appointmentRepo.exists({
      where: {
        id: appointmentId,
        status: AppointmentStatus.SCHEDULED,
        scheduledAt,
      },
    });
  }
}
