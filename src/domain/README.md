# Domain Layer

This layer holds the **pure business contracts** of the application. It must stay
free of framework and infrastructure concerns (no TypeORM entities, no HTTP, no
NestJS decorators other than plain injection tokens).

## Structure

```
src/domain/
  repositories/    # Ports: repository interfaces the application depends on
  entities/        # Pure domain entities / value objects (plain TypeScript)
```

## Repository Pattern (Ports and Adapters)

- **Domain (`src/domain/repositories/`)** declares the *port*: an interface that
  describes what persistence the application needs, not how it is performed.
- **Infrastructure (`src/infrastructure/repositories/`)** provides the
  *adapter*: the concrete implementation (TypeORM-based) that fulfills the port.
- **Feature modules** bind the two together by registering the interface token
  and pointing it at the adapter class. Services then depend only on the
  abstraction, which keeps them unit-testable with a simple mock.

## Binding sketch

```ts
// 1. Port — src/domain/repositories/user.repository.ts
export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  save(user: User): Promise<User>;
}

// 2. Adapter — src/infrastructure/repositories/typeorm-user.repository.ts
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { UserRepository } from '../../domain/repositories/user.repository';
import { UserEntity } from '../database/entities/user.entity';

export class TypeOrmUserRepository implements UserRepository {
  constructor(
    @InjectRepository(UserEntity)
    private readonly repository: Repository<UserEntity>,
  ) {}

  async findById(id: string): Promise<User | null> {
    return this.repository.findOneBy({ id });
  }

  async save(user: User): Promise<User> {
    return this.repository.save(user);
  }
}

// 3. Binding — src/users/users.module.ts
import { Module } from '@nestjs/common';

import { USER_REPOSITORY } from '../domain/repositories/user.repository';
import { TypeOrmUserRepository } from '../infrastructure/repositories/typeorm-user.repository';

@Module({
  providers: [
    { provide: USER_REPOSITORY, useClass: TypeOrmUserRepository },
  ],
})
export class UsersModule {}
```

## Rules

1. The domain layer never imports from `src/infrastructure`.
2. Infrastructure adapters implement domain interfaces, never the reverse.
3. Swapping the persistence technology only requires new adapters and updated
   bindings; domain and service code remain untouched.
