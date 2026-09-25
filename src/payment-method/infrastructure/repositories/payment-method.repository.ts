import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { PaymentMethodOrmEntity } from '../entities/typeorm/payment-method.entity';
import { PaymentMethodMapper } from '../mappers/payment-method.mapper';

import { PaymentMethod } from '@/payment-method/domain/entities/payment-method.model';
import {
  AddPaymentMethodInput,
  DuplicateCardLookup,
  EditPaymentMethodInput,
  PaymentMethodRepository,
} from '@/payment-method/domain/repositories/payment-method.repository';

@Injectable()
export class TypeOrmPaymentMethodRepository implements PaymentMethodRepository {
  constructor(
    @InjectRepository(PaymentMethodOrmEntity)
    private readonly repo: Repository<PaymentMethodOrmEntity>,
  ) {}

  async findAllForUser(userId: string): Promise<PaymentMethod[]> {
    const ormEntities = await this.repo.findBy({ userId });
    return ormEntities
      ? ormEntities.map((entity) => PaymentMethodMapper.toDomain(entity))
      : [];
  }

  async findByIdForUser(
    id: string,
    userId: string,
  ): Promise<PaymentMethod | null> {
    const ormEntity = await this.repo.findOneBy({ id, userId });
    return ormEntity ? PaymentMethodMapper.toDomain(ormEntity) : null;
  }

  async findDuplicate(
    userId: string,
    lookup: DuplicateCardLookup,
  ): Promise<PaymentMethod | null> {
    const ormEntity = await this.repo.findOneBy({ userId, ...lookup });
    return ormEntity ? PaymentMethodMapper.toDomain(ormEntity) : null;
  }

  async add(
    userId: string,
    input: AddPaymentMethodInput,
  ): Promise<PaymentMethod> {
    const ormEntity = this.repo.create({ userId, ...input });
    const saved = await this.repo.save(ormEntity);
    return PaymentMethodMapper.toDomain(saved);
  }

  async remove(id: string, userId: string): Promise<boolean> {
    const result = await this.repo.delete({ id, userId });
    return (result.affected ?? 0) > 0;
  }

  async edit(
    id: string,
    userId: string,
    input: EditPaymentMethodInput,
  ): Promise<PaymentMethod | null> {
    const existing = await this.repo.findOneBy({ id, userId });
    if (!existing) return null;

    Object.assign(existing, input);
    const saved = await this.repo.save(existing);
    return PaymentMethodMapper.toDomain(saved);
  }
}
