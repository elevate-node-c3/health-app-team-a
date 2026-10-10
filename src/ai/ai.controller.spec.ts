import { jest } from '@jest/globals';
import { ValidationPipe } from '@nestjs/common';

import { AiController } from './ai.controller';
import { SendAiMessageDto } from './dto/send-ai-message.dto';

import type { AiService } from './ai.service';
import type { Request, Response } from 'express';

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

/**
 * AC3/AC10 at the HTTP boundary. The service tests prove the capabilities use
 * the owner key they are given; these prove the endpoint derives that key from
 * the authenticated session and that nothing in the request body can influence
 * it — the two halves of "model-generated patient identifiers are never
 * trusted".
 */
describe('POST /ai/conversations/:id/messages resolves identity server-side', () => {
  function sendSetup() {
    const message = { id: 'message', outcome: 'completed' };
    const service = {
      claim: jest.fn<AiService['claim']>().mockResolvedValue(undefined),
      send: jest.fn<AiService['send']>().mockResolvedValue(message as never),
      pollMessage: jest
        .fn<AiService['pollMessage']>()
        .mockResolvedValue(message as never),
    };
    const res = {
      set: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
    } as unknown as Response;
    return {
      service,
      res,
      controller: new AiController(service as unknown as AiService),
    };
  }

  const body: SendAiMessageDto = {
    requestId: '00000000-0000-4000-8000-000000000000',
    content: 'my symptoms',
  };

  it('uses the authenticated account, not anything the caller supplied', async () => {
    const { service, controller, res } = sendSetup();
    await controller.send(
      'conversation',
      body,
      {
        deviceId: 'device',
        credentials: { user: { id: 'account-42' } },
        // A caller trying to impersonate another patient.
        body: { ...body, userId: 'victim-7', owner: 'u:victim-7' },
      } as unknown as Request,
      res,
    );
    expect(service.send).toHaveBeenCalledWith(
      'conversation',
      'u:account-42',
      body.requestId,
      body.content,
    );
  });

  it('uses the device key for a guest', async () => {
    const { service, controller, res } = sendSetup();
    await controller.send(
      'conversation',
      body,
      { deviceId: 'device' } as Request,
      res,
    );
    expect(service.send).toHaveBeenCalledWith(
      'conversation',
      'g:device',
      body.requestId,
      body.content,
    );
  });

  it('strips an injected identity field from the request body', async () => {
    // The global pipe runs with `whitelist: true`, and the DTO declares only
    // requestId and content, so an attacker-supplied identifier never reaches
    // the controller in the first place.
    const pipe = new ValidationPipe({ whitelist: true, transform: true });
    const cleaned = (await pipe.transform(
      { ...body, userId: 'victim-7', owner: 'u:victim-7' },
      { type: 'body', metatype: SendAiMessageDto },
    )) as Record<string, unknown>;
    expect(Object.keys(cleaned).sort()).toEqual(['content', 'requestId']);
  });
});
