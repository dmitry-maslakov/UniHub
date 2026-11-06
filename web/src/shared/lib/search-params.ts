// The router reads and writes the query as the browser has it: every value
// a string, a repeated key a list in its order. TanStack's default turns
// numbers and JSON into values and a list into JSON, which would break the
// signed query Better Auth sends to /sign-in.

export function parseSearch(search: string) {
  const params = new URLSearchParams(search);
  const result: Record<string, string | string[]> = {};
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    result[key] = values.length > 1 ? values : values[0];
  }
  return result;
}

export function stringifySearch(search: Record<string, unknown>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search))
    for (const one of [value].flat())
      if (one !== undefined && one !== null) params.append(key, String(one));
  const query = params.toString();
  return query ? `?${query}` : '';
}
