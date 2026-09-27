import { FakePaymentProviderAdapter } from './fake-payment-provider.adapter';

describe('FakePaymentProviderAdapter', () => {
  let provider: FakePaymentProviderAdapter;

  beforeEach(() => {
    provider = new FakePaymentProviderAdapter();
  });

  it('returns the same charge result for a repeated idempotency key', async () => {
    const request = {
      providerRef: 'fake_4242_token',
      amount: '125.00',
      currency: 'EGP',
      idempotencyKey: 'attempt-123',
    };

    const first = await provider.charge(request);
    const retry = await provider.charge(request);

    expect(retry).toEqual(first);
    expect(await provider.getCharge(request.idempotencyKey)).toEqual(first);
    expect(first.status).toBe('succeeded');
  });

  it('declines the designated test card and rejects fabricated webhook results', async () => {
    const request = {
      providerRef: 'fake_0002_token',
      amount: '125.00',
      currency: 'EGP',
      idempotencyKey: 'attempt-declined',
    };
    const result = await provider.charge(request);

    expect(result.status).toBe('declined');
    await expect(
      provider.verifyWebhook(
        {
          idempotencyKey: request.idempotencyKey,
          providerPaymentId: 'fake_payment_forged',
          status: 'succeeded',
        },
        'fake-provider-signature',
      ),
    ).resolves.toBeNull();

    await expect(
      provider.verifyWebhook(
        {
          idempotencyKey: request.idempotencyKey,
          providerPaymentId: result.providerPaymentId,
          status: result.status,
        },
        'fake-provider-signature',
      ),
    ).resolves.toMatchObject({ status: 'declined' });
  });
});
