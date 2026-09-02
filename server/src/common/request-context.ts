import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
  requestId: string;
  userId?: string;
  tenantId?: string;
  companyId?: string;
  route?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(context: RequestContext, callback: () => T) {
  return storage.run(context, callback);
}

export function getRequestContext() {
  return storage.getStore();
}

export function updateRequestContext(patch: Partial<RequestContext>) {
  const context = storage.getStore();
  if (context) Object.assign(context, patch);
}
