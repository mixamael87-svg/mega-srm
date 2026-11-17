import { ZodError } from 'zod';
import { DocumentBuildError } from '../domain/buildDocument';
import { SalesDriveError } from '../salesdrive/client';

export class HttpError extends Error {
  constructor(public readonly status: number, message: string, public readonly code?: string) {
    super(message);
    this.name = 'HttpError';
  }
}

export const jsonResponse = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });

/** Maps known errors to JSON responses with a Ukrainian message; unknown errors → 500 without details. */
export function errorResponse(e: unknown): Response {
  if (e instanceof HttpError) return jsonResponse({ error: e.message, ...(e.code ? { code: e.code } : {}) }, e.status);
  if (e instanceof ZodError) return jsonResponse({ error: 'Невірні дані', issues: e.issues.map(i => ({ path: i.path.join('.'), message: i.message })) }, 400);
  if (e instanceof DocumentBuildError) return jsonResponse({ error: e.message, code: e.code, details: e.details }, 422);
  if (e instanceof SalesDriveError) return jsonResponse({ error: e.message, code: 'SALESDRIVE' }, 502);
  console.error(e);
  return jsonResponse({ error: 'Внутрішня помилка сервера' }, 500);
}

export function route<A extends unknown[]>(fn: (...a: A) => Promise<Response>) {
  return async (...a: A): Promise<Response> => {
    try { return await fn(...a); } catch (e) { return errorResponse(e); }
  };
}
