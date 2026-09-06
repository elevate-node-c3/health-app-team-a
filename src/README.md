# Source Architecture

The source tree uses a feature-first vertical-slice architecture guided by
Domain-Driven Design (DDD) and Ports-and-Adapters principles. Each feature
owns the code that expresses its domain and the adapters that integrate that
domain with external systems.

## Layout

```text
src/
  config/                       # Application configuration
  infrastructure/               # Shared technical infrastructure only
    cache/
    database/
  auth/                         # Auth feature
    domain/
      entities/                 # Pure domain models
      repositories/             # Repository ports and Symbol tokens
    infrastructure/
      entities/                 # TypeORM schemas
      repositories/             # Repository adapters
      mappers/                  # ORM-to-domain mappings
    dto/                         # Transport-facing data transfer objects
    auth.module.ts              # Feature composition root
    auth.controller.ts          # HTTP adapter
    auth.service.ts             # Application use cases
  app.module.ts
```

Feature `domain/` directories contain only `entities/` and `repositories/`.
Feature `infrastructure/` directories contain only ORM `entities/`, repository
adapters, and `mappers/`. Services belong at the feature root, not in either
layer. Shared database and cache infrastructure remains at the top level.

## Controllers and Services

Small features keep one controller and one service at the feature root, such
as `auth.controller.ts` and `auth.service.ts`. As a feature grows, promote
these into root-level `controllers/` and `services/` directories. This keeps
the feature boundary intact while allowing its application layer to scale.

## Naming

Pure domain models use the `*.model.ts` suffix and must not be decorated as
TypeORM entities. Persistence schemas use the `*.entity.ts` suffix and contain
TypeORM `@Entity` definitions. The distinction prevents the TypeORM CLI glob
(`src/**/*.entity.ts`) from loading domain models.
