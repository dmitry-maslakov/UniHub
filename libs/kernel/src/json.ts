// what JSON.parse can give back, and jsonb can keep
export type Json =
  string | number | boolean | null | Json[] | { [key: string]: Json };
