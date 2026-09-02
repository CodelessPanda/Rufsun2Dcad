export interface RequestUser {
  id: string;
  email: string;
}

export interface AuthenticatedRequest {
  user?: RequestUser;
  cookies?: Record<string, string>;
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
}
