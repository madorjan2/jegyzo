// Shape of the Express Response bits the /health handler touches. Typed as an
// interface here so the handler compiles without leaking the whole express-5
// core types through the adapter boundary.
export type ExRequest = unknown;
export interface ExResponse {
  status: (n: number) => { json: (body: unknown) => void };
}
