import { EventEmitter2 } from '@nestjs/event-emitter';

export interface EventOptions {
  favoriteId: string;
  payload: object;
}

export class EventService {
  constructor(private eventEmitter: EventEmitter2) {}

  publishEvent(eventName: string, eventOptions?: EventOptions): void {
    this.eventEmitter.emit(eventName, eventOptions);
  }
}
