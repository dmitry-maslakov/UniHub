// A string (or number) that went through a check: a ContentHash is a string,
// but a string is not a ContentHash until ContentHash.parse said so. Brands
// survive JSON (job data, outbox payloads), classes wouldn't.
declare const brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [brand]: B };
