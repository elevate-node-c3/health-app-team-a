import { jest } from '@jest/globals';
import { ConflictException, NotFoundException } from '@nestjs/common';

import { CardBrand } from './domain/entities/card-brand.enum';
import { PaymentMethod } from './domain/entities/payment-method.model';
import { PAYMENT_METHOD_ADDED_EVENT } from './payment-method.events';
import { ExpiredCardException } from './payment-method.exceptions';
import { PaymentMethodService } from './payment-method.service';

import type {
  AddPaymentMethodInput,
  DuplicateCardLookup,
  EditPaymentMethodInput,
} from './domain/repositories/payment-method.repository';
import type {
  RawCardDetails,
  TokenizedCard,
} from './domain/services/payment-provider.port';

function makeCard(
  overrides: Partial<{
    id: string;
    userId: string;
    expiryMonth: number;
    expiryYear: number;
  }> = {},
): PaymentMethod {
  return new PaymentMethod(
    overrides.id ?? 'card-1',
    overrides.userId ?? 'user-1',
    'provider-ref-1',
    CardBrand.VISA,
    '4242',
    'Nour',
    overrides.expiryMonth ?? 12,
    overrides.expiryYear ?? 2030,
    new Date(),
    new Date(),
  );
}

describe('PaymentMethodService', () => {
  let paymentMethodRepository: {
    findAllForUser: jest.Mock;
    findByIdForUser: jest.Mock;
    findDuplicate: jest.Mock;
    add: jest.Mock;
    edit: jest.Mock;
    remove: jest.Mock;
  };
  let paymentProvider: { tokenize: jest.Mock };
  let eventEmitter: { emit: jest.Mock };
  let service: PaymentMethodService;

  const now = new Date('2026-09-26T00:00:00Z');

  beforeEach(() => {
    paymentMethodRepository = {
      findAllForUser: jest
        .fn<() => Promise<PaymentMethod[]>>()
        .mockResolvedValue([]),
      findByIdForUser: jest
        .fn<() => Promise<PaymentMethod | null>>()
        .mockResolvedValue(null),
      findDuplicate: jest
        .fn<
          (
            userId: string,
            lookup: DuplicateCardLookup,
          ) => Promise<PaymentMethod | null>
        >()
        .mockResolvedValue(null),
      add: jest
        .fn<
          (
            userId: string,
            input: AddPaymentMethodInput,
          ) => Promise<PaymentMethod>
        >()
        .mockResolvedValue(makeCard()),
      edit: jest
        .fn<
          (
            id: string,
            userId: string,
            input: EditPaymentMethodInput,
          ) => Promise<PaymentMethod | null>
        >()
        .mockResolvedValue(makeCard()),
      remove: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
    };
    paymentProvider = {
      tokenize: jest
        .fn<(card: RawCardDetails) => Promise<TokenizedCard>>()
        .mockResolvedValue({
          providerRef: 'provider-ref-1',
          brand: CardBrand.VISA,
          last4: '4242',
        }),
    };
    eventEmitter = { emit: jest.fn() };

    service = new PaymentMethodService(
      paymentMethodRepository as never,
      paymentProvider as never,
      eventEmitter as never,
    );
  });

  describe('add', () => {
    const dto = {
      holderName: 'Nour',
      cardNumber: '4242424242424242',
      ccv: '123',
      expiry: '12/30',
      saveCard: true,
    };

    it('never passes cardNumber/ccv to repository.add', async () => {
      await service.add('user-1', dto, now);

      expect(paymentMethodRepository.add).toHaveBeenCalledWith('user-1', {
        providerRef: 'provider-ref-1',
        brand: CardBrand.VISA,
        last4: '4242',
        holderName: 'Nour',
        expiryMonth: 12,
        expiryYear: 2030,
      });
    });

    it('skips persistence and the added event when saveCard is false', async () => {
      await service.add('user-1', { ...dto, saveCard: false }, now);

      expect(paymentMethodRepository.add).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('emits PAYMENT_METHOD_ADDED_EVENT after a successful save', async () => {
      await service.add('user-1', dto, now);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        PAYMENT_METHOD_ADDED_EVENT,
        {
          userId: 'user-1',
          paymentMethodId: 'card-1',
          brand: CardBrand.VISA,
          last4: '4242',
          at: now,
        },
      );
    });

    it('throws ConflictException when a duplicate card exists', async () => {
      paymentMethodRepository.findDuplicate.mockResolvedValue(makeCard());

      await expect(service.add('user-1', dto, now)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(paymentMethodRepository.add).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('marks a card isExpired when its expiry is in the past', async () => {
      paymentMethodRepository.findAllForUser.mockResolvedValue([
        makeCard({ expiryMonth: 1, expiryYear: 2020 }),
      ]);

      const [card] = await service.list('user-1', now);

      expect(card.isExpired).toBe(true);
      expect(card.isPayable).toBe(false);
    });

    it('does not mark a card isExpired when its expiry is in the future', async () => {
      paymentMethodRepository.findAllForUser.mockResolvedValue([
        makeCard({ expiryMonth: 12, expiryYear: 2030 }),
      ]);

      const [card] = await service.list('user-1', now);

      expect(card.isExpired).toBe(false);
      expect(card.isPayable).toBe(true);
    });
  });

  describe('edit', () => {
    it('throws NotFoundException when the card is not owned by the user', async () => {
      paymentMethodRepository.edit.mockResolvedValue(null);

      await expect(
        service.edit('user-1', 'card-1', { holderName: 'New Name' }, now),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when the card is not owned by the user', async () => {
      paymentMethodRepository.remove.mockResolvedValue(false);

      await expect(
        service.remove('user-1', 'card-1', now),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  describe('getForCharge', () => {
    it('throws ExpiredCardException when the live expiry check fails', async () => {
      paymentMethodRepository.findByIdForUser.mockResolvedValue(
        makeCard({ expiryMonth: 1, expiryYear: 2020 }),
      );

      await expect(
        service.getForCharge('user-1', 'card-1', now),
      ).rejects.toBeInstanceOf(ExpiredCardException);
    });

    it('throws NotFoundException when the card is missing or not owned', async () => {
      paymentMethodRepository.findByIdForUser.mockResolvedValue(null);

      await expect(
        service.getForCharge('user-1', 'card-1', now),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
