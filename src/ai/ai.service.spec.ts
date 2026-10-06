import { jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';

import { AiService } from './ai.service';
import { AiConversation, AiMessage } from './domain/entities/ai.model';

import type { AiRepository } from './domain/repositories/ai.repository';
import type {
  AiTransactionRepositories,
  AiUnitOfWork,
} from './domain/repositories/unit-of-work';
import type { AiProvider } from './domain/services/ai-provider.port';
import type { SpecialtyRepository } from 'src/doctor/domain/repositories/specialty.repository';

function setup() {
  const message = new AiMessage(
    'message',
    'conversation',
    'request',
    'symptoms',
    'saved',
    'completed',
    null,
    null,
    new Date(),
  );
  const repo = {
    findConversation: jest
      .fn<AiRepository['findConversation']>()
      .mockResolvedValue(
        new AiConversation('conversation', 'g:device', new Date()),
      ),
    listConversations: jest
      .fn<AiRepository['listConversations']>()
      .mockResolvedValue([]),
    createConversation: jest
      .fn<AiRepository['createConversation']>()
      .mockImplementation((row) => Promise.resolve(row)),
    claimGuest: jest
      .fn<AiRepository['claimGuest']>()
      .mockResolvedValue(undefined),
    listMessages: jest
      .fn<AiRepository['listMessages']>()
      .mockResolvedValue([message]),
    recentCompletedMessages: jest
      .fn<AiRepository['recentCompletedMessages']>()
      .mockResolvedValue([]),
    findMessage: jest
      .fn<AiRepository['findMessage']>()
      .mockResolvedValue(message),
    findRequest: jest
      .fn<AiRepository['findRequest']>()
      .mockResolvedValue(message),
    countMessages: jest
      .fn<AiRepository['countMessages']>()
      .mockResolvedValue(0),
    createMessage: jest
      .fn<AiRepository['createMessage']>()
      .mockImplementation((row) => Promise.resolve(row)),
    persistContent: jest
      .fn<AiRepository['persistContent']>()
      .mockResolvedValue(undefined),
    completeMessage: jest
      .fn<AiRepository['completeMessage']>()
      .mockResolvedValue(true),
    consumeDailyQuota: jest
      .fn<AiRepository['consumeDailyQuota']>()
      .mockResolvedValue(false),
  };
  const lockOwner = jest
    .fn<AiTransactionRepositories['lockOwner']>()
    .mockResolvedValue(undefined);
  const appendEvent = jest
    .fn<AiTransactionRepositories['appendEvent']>()
    .mockResolvedValue(undefined);
  const uow: AiUnitOfWork = {
    execute: (work) => work({ conversations: repo, lockOwner, appendEvent }),
  };
  const stream = jest.fn<AiProvider['stream']>();
  const specialties = {
    findAll: () => Promise.resolve([]),
  } as unknown as SpecialtyRepository;
  const service = new AiService(
    repo,
    uow,
    { stream },
    specialties,
    new ConfigService(),
  );
  return { service, repo, stream, message, lockOwner, appendEvent };
}

describe('AI use cases through domain ports', () => {
  it('persists streamed content and safe failures with terminal metrics', async () => {
    const { service, repo, stream, appendEvent } = setup();
    repo.findRequest.mockResolvedValue(null);
    repo.consumeDailyQuota.mockResolvedValue(true);
    stream.mockImplementation(async function* () {
      await Promise.resolve();
      yield { text: 'Partial response' };
      throw new Error('private provider credentials and diagnostics');
    });
    const message = await service.send(
      'conversation',
      'g:device',
      'new',
      'symptoms',
    );
    for (let i = 0; i < 30 && !repo.completeMessage.mock.calls.length; i++)
      await Promise.resolve();
    expect(repo.persistContent).toHaveBeenCalledWith(
      message.id,
      'Partial response',
    );
    expect(repo.completeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        content:
          'Partial response\n\nUnable to complete the response right now. Please try again later.',
        suggestion: null,
      }),
      'failed',
      expect.objectContaining({ usageAvailable: false, costUsd: null }),
    );
    for (let i = 0; i < 10 && !appendEvent.mock.calls.length; i++)
      await Promise.resolve();
    expect(appendEvent).toHaveBeenCalledWith(
      'ai.message.answered',
      expect.objectContaining({ outcome: 'failed' }),
    );
  });
  it('replays without charging quota or generating again', async () => {
    const { service, repo, stream, message } = setup();
    expect(
      await service.send('conversation', 'g:device', 'request', 'symptoms'),
    ).toBe(message);
    expect(repo.consumeDailyQuota).not.toHaveBeenCalled();
    expect(stream).not.toHaveBeenCalled();
  });
  it('rejects foreign owners before provider access', async () => {
    const { service, repo, stream } = setup();
    repo.findConversation.mockResolvedValue(null);
    await expect(
      service.send('conversation', 'u:other', 'request', 'symptoms'),
    ).rejects.toThrow('Conversation not found');
    expect(stream).not.toHaveBeenCalled();
  });
  it('rejects a reused request ID with changed input', async () => {
    const { service } = setup();
    await expect(
      service.send('conversation', 'g:device', 'request', 'changed'),
    ).rejects.toThrow('Request ID already used');
  });
  it.each([
    ['g:device', 10],
    ['u:account', 50],
  ])('enforces the limit for %s', async (owner, limit) => {
    const { service, repo } = setup();
    repo.findRequest.mockResolvedValue(null);
    await expect(
      service.send('conversation', owner, 'new', 'symptoms'),
    ).rejects.toThrow('Daily AI message limit reached');
    expect(repo.consumeDailyQuota).toHaveBeenCalledWith(owner, limit);
    expect(repo.createMessage).not.toHaveBeenCalled();
  });
  it('uses the guest ownership lock during migration', async () => {
    const { service, repo, lockOwner } = setup();
    await service.claim('device', 'account');
    expect(lockOwner).toHaveBeenCalledWith('g:device');
    expect(repo.claimGuest).toHaveBeenCalledWith('device', 'account');
  });
  it('persists conversation and its started event through one unit of work', async () => {
    const { service, appendEvent } = setup();
    const row = await service.create('g:device');
    expect(appendEvent).toHaveBeenCalledWith('ai.conversation.started', {
      conversationId: row.id,
    });
  });
  it('marks stale content interrupted without regeneration', async () => {
    const { service, message, repo, stream } = setup();
    message.outcome = 'streaming';
    message.createdAt = new Date(Date.now() - 130000);
    await service.get('conversation', 'g:device');
    expect(repo.completeMessage).toHaveBeenCalledWith(
      message,
      'interrupted',
      expect.objectContaining({ usageAvailable: false }),
    );
    expect(stream).not.toHaveBeenCalled();
  });
});
