import { Injectable, Logger } from '@nestjs/common';

import { AiMessage, type AiOutcome } from '../../domain/entities/ai.model';

@Injectable()
export class AiGenerationErrorHandler {
  private readonly logger = new Logger(AiGenerationErrorHandler.name);

  run(generate: () => Promise<void>): void {
    void generate().catch(() =>
      this.logger.error('AI response persistence failed'),
    );
  }

  async execute(
    message: AiMessage,
    generate: () => Promise<void>,
  ): Promise<AiOutcome> {
    try {
      await generate();
      return 'completed';
    } catch (error) {
      this.logger.error(
        `AI generation failed for message ${message.id}`,
        error instanceof Error ? error.stack : error,
      );
      const safe = /[\u0600-\u06ff]/.test(message.input)
        ? 'تعذر اكمال الرد الان يرجى المحاولة مرة اخرى بعد قليل.'
        : 'Unable to complete the response right now. Please try again later.';
      message.content = message.content
        ? `${message.content}\n\n${safe}`
        : safe;
      message.suggestion = null;
      return 'failed';
    }
  }
}
