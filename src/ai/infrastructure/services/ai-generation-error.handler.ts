import { Injectable, Logger } from '@nestjs/common';

import { isArabic } from '../../ai.safety';
import { withDisclaimer } from '../../ai.util';
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
      // Only the error's class name is logged. A provider failure message or
      // stack can carry the outbound request body and the API key, and this
      // handler runs on every upstream error, so neither is safe to log.
      this.logger.error(
        `AI generation failed for message ${message.id} (${
          error instanceof Error ? error.constructor.name : typeof error
        })`,
      );
      const safe = isArabic(message.input)
        ? 'تعذر اكمال الرد الان يرجى المحاولة مرة اخرى بعد قليل.'
        : 'Unable to complete the response right now. Please try again later.';
      message.content = withDisclaimer(
        message.content ? `${message.content}\n\n${safe}` : safe,
      );
      message.suggestion = null;
      return 'failed';
    }
  }
}
