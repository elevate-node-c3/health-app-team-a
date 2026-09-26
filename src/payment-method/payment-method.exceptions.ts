import { BadRequestException } from '@nestjs/common';

export class ExpiredCardException extends BadRequestException {
  constructor() {
    super('This card has expired');
  }
}
