import { ClientsModule, Transport } from '@nestjs/microservices';

export const RabbitMQClientConfig = ClientsModule.register([
  {
    name: 'FAVORITE_DOCTOR',
    transport: Transport.RMQ,
    options: {
      urls: ['amqp://localhost:5672'],
      queue: 'favorite-doctor',
      queueOptions: {
        durable: false,
      },
    },
  },
]);
