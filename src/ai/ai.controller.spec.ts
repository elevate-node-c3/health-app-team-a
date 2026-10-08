import { jest } from '@jest/globals';

import { AiController } from './ai.controller';

import type { AiService } from './ai.service';
import type { Request } from 'express';

describe('AI shared device identity', () => {
  function setup() {
    const service = {
      claim: jest.fn<AiService['claim']>().mockResolvedValue(undefined),
      create: jest.fn<AiService['create']>(),
      list: jest.fn<AiService['list']>().mockResolvedValue([]),
    };
    return {
      service,
      controller: new AiController(service as unknown as AiService),
    };
  }

  it('uses the guard device ID for a guest without creating another cookie', async () => {
    const { service, controller } = setup();
    await controller.create({ deviceId: 'shared-device' } as Request);
    expect(service.create).toHaveBeenCalledWith('g:shared-device');
    expect(service.claim).not.toHaveBeenCalled();
  });

  it('claims the shared guest history before listing account conversations', async () => {
    const { service, controller } = setup();
    await controller.list({
      deviceId: 'shared-device',
      credentials: { user: { id: 'account' } },
    } as Request);
    expect(service.claim).toHaveBeenCalledWith('shared-device', 'account');
    expect(service.list).toHaveBeenCalledWith('u:account');
    expect(service.claim.mock.invocationCallOrder[0]).toBeLessThan(
      service.list.mock.invocationCallOrder[0],
    );
  });
});
