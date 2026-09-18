export type SearchResultType = 'specialty' | 'doctor';

export class SearchResult {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly type: SearchResultType,
  ) {}
}
