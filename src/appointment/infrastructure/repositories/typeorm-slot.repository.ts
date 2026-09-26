import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { SlotOrmEntity } from '../entities/typeorm/slot.entity';

import { Slot } from '@/appointment/domain/entities/slot.model';
import { SlotRepo } from '@/appointment/domain/repositories/slot.repository';

@Injectable()
export class TypeOrmSlotRepo implements SlotRepo {
  constructor(
    @InjectRepository(SlotOrmEntity)
    private readonly repository: Repository<SlotOrmEntity>,
  ) {}

  async find(): Promise<Slot[]> {
    const slotsOrm = await this.repository.find();

    return slotsOrm.map((entity) => this.toDomain(entity));
  }

  async findById(id: string): Promise<Slot | null> {
    const entity = await this.repository.findOne({
      where: { id },
    });

    if (!entity) {
      return null;
    }

    return this.toDomain(entity);
  }

  private toDomain(entity: SlotOrmEntity): Slot {
    return new Slot(
      entity.id,
      entity.doctorClinicScheduleId,
      entity.date,
      entity.startTime,
      entity.endTime,
      entity.status,
      entity.createdAt,
      entity.updatedAt,
    );
  }
}
