import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PaymentMethod } from 'src/payment-method/domain/entities/payment-method.model';
import {
  AddPaymentMethodInput,
  DuplicateCardLookup,
  EditPaymentMethodInput,
  PaymentMethodRepository,
} from 'src/payment-method/domain/repositories/payment-method.repository';
import { PaymentMethodOrmEntity } from 'src/payment-method/infrastructure/entities/typeorm/payment-method.entity';
import { Repository } from 'typeorm';

@Injectable()
export class TypeOrmPaymentMethodRepository implements PaymentMethodRepository {
  constructor(
    @InjectRepository(PaymentMethodOrmEntity)
    private readonly repo: Repository<PaymentMethodOrmEntity>,
  ) {}

  async findAllForUser(userId: string): Promise<PaymentMethod[]> {
    const rows = await this.repo.findBy({ userId });
    return rows.map((row) => this.toDomain(row));
  }

  async findByIdForUser(
    id: string,
    userId: string,
  ): Promise<PaymentMethod | null> {
    const row = await this.repo.findOneBy({ id, userId });
    return row ? this.toDomain(row) : null;
  }

  async findDuplicate(
    userId: string,
    lookup: DuplicateCardLookup,
  ): Promise<PaymentMethod | null> {
    const row = await this.repo.findOneBy({ userId, ...lookup });
    return row ? this.toDomain(row) : null;
  }

  async add(
    userId: string,
    input: AddPaymentMethodInput,
  ): Promise<PaymentMethod> {
    try {
      const saved = await this.repo.save(
        this.repo.create({ userId, ...input }),
      );
      return this.toDomain(saved);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException('This card is already saved');
      }
      throw error;
    }
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
    return this.toDomain(saved);
  }

  async remove(id: string, userId: string): Promise<boolean> {
    const result = await this.repo.delete({ id, userId });
    return (result.affected ?? 0) > 0;
  }

  private toDomain(row: PaymentMethodOrmEntity): PaymentMethod {
    return new PaymentMethod(
      row.id,
      row.userId,
      row.providerRef,
      row.brand,
      row.last4,
      row.holderName,
      row.expiryMonth,
      row.expiryYear,
      row.createdAt,
      row.updatedAt,
    );
  }
}
