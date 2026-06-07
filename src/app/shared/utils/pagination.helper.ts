export class PaginationHelper {
  static onPageChange(
    event: { first?: number; rows?: number },
    currentPageSize: number,
  ): { page: number; pageSize: number } {
    const pageSize = event.rows ?? currentPageSize;
    const page = Math.floor((event.first ?? 0) / pageSize) + 1;
    return { page, pageSize };
  }
}
