import { api } from "../api/client";
import type { CategoryOption } from "../api/types";
import type { Option } from "./categories";
import { slugify } from "./categories";
import { useAsync } from "./useAsync";

// Backs the "+ Neue Kategorie hinzufügen" affordance on a dropdown: fetches this user's saved
// custom options for one dropdown (identified by listKey, e.g. "appointment-category") and offers
// `add()` to persist a new one. Options already known for that list are never duplicated - typing
// a label that (case/spacing aside) matches an existing option just reuses it.
export function useCustomOptions(listKey: string) {
  const query = useAsync<CategoryOption[]>(() => api.get("/api/category-options"), []);

  const options: Option[] = (query.data ?? [])
    .filter((o) => o.listKey === listKey)
    .map((o) => ({ value: o.value, label: o.label }));

  async function add(label: string, knownOptions: Option[]): Promise<Option> {
    const trimmed = label.trim();
    const value = slugify(trimmed);
    const existing = [...knownOptions, ...options].find((o) => o.value === value);
    if (existing) return existing;

    const created = await api.post<CategoryOption>("/api/category-options", { listKey, value, label: trimmed });
    await query.reload();
    return { value: created.value, label: created.label };
  }

  return { options, add, loading: query.loading };
}
