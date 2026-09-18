# Search Feature

## Purpose

The search feature lets a patient search the existing doctor catalogue using either a specialty or a doctor name. It returns typed results so the client can label each suggestion as `specialty` or `doctor`.

The feature is implemented as its own NestJS module because it crosses the doctor and specialty catalogues and owns separate concerns: search ranking, search history, guest identity, and search events.

## Architecture

```text
src/search/
  domain/
    entities/search-result.model.ts
    repositories/search.repository.ts
    repositories/search-history.repository.ts
  infrastructure/
    entities/typeorm/search-history.entity.ts
    repositories/typeorm-search.repository.ts
    repositories/typeorm-search-history.repository.ts
  dto/search-query.dto.ts
  search.controller.ts
  search.events.ts
  search.service.ts
  search.module.ts
```

`SearchModule` is registered by `AppModule`. It imports `AuthModule` because the optional authentication guard needs the existing `SESSION_REPOSITORY`. It also registers the existing doctor and specialty TypeORM entities; it does not duplicate those entities or move their ownership from `DoctorModule`.

The application flow is:

```text
HTTP request
  -> SearchController
  -> SearchService
  -> SearchRepository / SearchHistoryRepository ports
  -> TypeORM adapters
```

## HTTP API

All routes are under `/doctors/search` and allow both guests and authenticated users.

### Suggestions

```http
GET /doctors/search/suggestions?query=Den
```

Returns matching specialties and verified doctors:

```json
{
  "suggestions": [
    { "id": "...", "name": "Dentistry", "type": "specialty" },
    { "id": "...", "name": "Dental Procedures", "type": "specialty" },
    { "id": "...", "name": "Sara Mahmoud", "type": "doctor" }
  ]
}
```

Suggestions do not write search history.

### Submit a search

```http
GET /doctors/search?query=Sara%20Mahmoud
```

The response contains the normalized query and typed results. A `search.performed` event is published after the search result is obtained. The history writer handles that event asynchronously so the response does not wait for history persistence.

### Read history

```http
GET /doctors/search/history
```

Response:

```json
{
  "history": ["Sara Mahmoud", "Cardiology"]
}
```

### Clear history

```http
DELETE /doctors/search/history
```

This permanently deletes the current owner's stored history.

## Matching and ordering

- Queries are trimmed and Unicode-normalized with `NFKC`.
- The DTO accepts between 2 and 500 characters, so one-character queries are rejected.
- Matching is case-insensitive and partial. Any part of a name can match, so `mahmoud` can find `Sara Mahmoud`.
- `%`, `_`, and backslash are escaped before being used in the SQL `LIKE` expression.
- Matching supports normal database Unicode case behavior, including Arabic text where the PostgreSQL collation supports it.
- Typo correction and transliteration are intentionally not implemented.
- Specialties always appear before doctors.
- Within each type, results are ordered by:
  1. Exact match
  2. Prefix match
  3. Word-boundary match
  4. Other substring match
  5. Shorter name
  6. Alphabetical name
  7. Stable ID tie-breaker

Each catalogue query is limited before the two result lists are combined, and the final response is limited to 10 results.

## Search history ownership

The controller creates a long-lived, HTTP-only `searchDeviceId` cookie for guests. History uses namespaced owner keys:

- `device:<device-id>` for guests
- `user:<user-id>` for authenticated users

The database has a unique constraint on `(ownerKey, normalizedTerm)`, which prevents duplicate terms for one owner. Repeating a term updates its timestamp, making it newest-first. History is trimmed to the 10 most recent terms.

When an authenticated user accesses search or history, device history is merged into the user owner and the device-owned rows are removed. This keeps the same history after the guest signs in without exposing one user's history to another user. A shared device intentionally shares its guest history until the requests are associated with a signed-in account.

The `OptionalAuth` decorator allows requests without an access token. If an access token is supplied but invalid, the request is rejected rather than silently downgraded to guest access.

## Database migration

The migration was generated through the project command rather than authored manually:

```bash
npm run migration:generate -- src/infrastructure/database/migrations/AddSearchHistoryAndIndexes
```

This produced a timestamped migration under `src/infrastructure/database/migrations/`. Because the connected database did not contain the existing catalogue tables when generation ran, TypeORM included the existing catalogue schema together with the new `search_histories` table and indexes. Review the generated migration against the target database before applying it:

```bash
npm run migration:show
npm run migration:run
```

The search history table stores the owner key, display term, normalized term, and creation timestamp. TypeORM-generated indexes enforce uniqueness and newest-first lookup by owner.

## Postman

The root `health-app.postman_collection.json` contains a `Search` folder with requests for:

- Suggestions using `Den`
- Submitted search using `Sara Mahmoud`
- Reading search history
- Clearing search history

The Postman client cookie jar carries `searchDeviceId` between guest requests.

## Validation performed

The implementation was validated with:

```bash
npm run build
npm test -- --runInBand
npm run start:dev
```

The Jest suite passed with 5 suites and 25 tests. Development startup compiled with zero errors and registered all four search routes successfully.
