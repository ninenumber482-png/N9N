export class FilterHelper {
  static applySearch<T>(
    items: T[],
    search: string,
    fields: Array<keyof T | ((item: T) => string | undefined | null)>,
  ): T[] {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter((item) =>
      fields.some((field) => {
        const val = typeof field === 'function' ? field(item) : (item[field] as unknown as string);
        return String(val ?? '').toLowerCase().includes(q);
      }),
    );
  }

  static applyStatus<T>(items: T[], field: keyof T, status: string): T[] {
    if (!status) return items;
    return items.filter((item) => (item[field] as unknown as string) === status);
  }

  static applyDateRange<T>(items: T[], field: keyof T, from: string | null, to: string | null): T[] {
    if (!from && !to) return items;
    return items.filter((item) => {
      const d = new Date(item[field] as unknown as string);
      if (from && d < new Date(from)) return false;
      if (to && d > new Date(to + 'T23:59:59')) return false;
      return true;
    });
  }
}
