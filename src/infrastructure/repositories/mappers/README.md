# Mappers

This folder contains **mappers** that translate between ORM entities
(infrastructure) and domain models (domain layer). They are the boundary
guardians of the ports-and-adapters architecture: TypeORM entities and domain
models may represent the same data, but they must never leak into each other's
layers.

## Convention

Every mapper must be a **plain class or object** — no decorators, no dependency
injection, no framework imports — exposing exactly two methods:

```ts
toDomain(entity: OrmEntity): DomainModel;
toEntity(domain: DomainModel): OrmEntity;
```

## Example

```ts
// src/infrastructure/repositories/mappers/user.mapper.ts
import { User } from '../../../domain/entities/user';
import { UserEntity } from '../../database/entities/user.entity';

export class UserMapper {
  static toDomain(entity: UserEntity): User {
    return new User(
      entity.id,
      entity.email,
      entity.displayName,
      entity.createdAt,
    );
  }

  static toEntity(domain: User): UserEntity {
    const entity = new UserEntity();
    entity.id = domain.id;
    entity.email = domain.email;
    entity.displayName = domain.displayName;
    entity.createdAt = domain.createdAt;
    return entity;
  }
}
```

## Rules

1. Mappers live in `src/infrastructure/repositories/mappers/` and are the only
   place allowed to reference both `src/domain` and ORM entities in the same
   file.
2. `toDomain` output must be a pure domain model: no TypeORM columns, lazy
   relations, or `@Decorated` classes.
3. `toEntity` must fully populate the ORM entity so repositories can `save()`
   it directly.
4. Repositories in `src/infrastructure/repositories/` call mappers at their
   boundaries: entities never leave the repository, domain models never enter
   TypeORM calls.
5. Mappers must stay side-effect free (no I/O, no logging) so they can be unit
   tested without mocks.
