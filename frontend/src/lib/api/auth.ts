import { apiFetch } from "./base";

export type UserRole = "admin" | "commercial";

export interface UserOut {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: UserOut;
}

export interface UserCreateResponse {
  user: UserOut;
  temporary_password: string;
}

export const authApi = {
  login: (email: string, password: string): Promise<TokenResponse> =>
    apiFetch<TokenResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  me: (): Promise<UserOut> => apiFetch<UserOut>("/auth/me"),

  createUser: (email: string, fullName: string): Promise<UserCreateResponse> =>
    apiFetch<UserCreateResponse>("/auth/users", {
      method: "POST",
      body: JSON.stringify({ email, full_name: fullName }),
    }),

  listUsers: (): Promise<UserOut[]> => apiFetch<UserOut[]>("/auth/users"),
};
