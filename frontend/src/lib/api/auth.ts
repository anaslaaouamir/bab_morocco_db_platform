import { apiFetch } from "./base";

export type UserRole = "admin" | "commercial";

export interface UserOut {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  updated_at: string | null;
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

export interface UserUpdatePayload {
  full_name?: string;
  email?: string;
  is_active?: boolean;
}

export interface ResetPasswordResponse {
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

  updateProfile: (fullName: string): Promise<UserOut> =>
    apiFetch<UserOut>("/auth/me", {
      method: "PATCH",
      body: JSON.stringify({ full_name: fullName }),
    }),

  changePassword: (currentPassword: string, newPassword: string): Promise<UserOut> =>
    apiFetch<UserOut>("/auth/me/change-password", {
      method: "POST",
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    }),

  updateUser: (id: string, data: UserUpdatePayload): Promise<UserOut> =>
    apiFetch<UserOut>(`/auth/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  resetPassword: (id: string): Promise<ResetPasswordResponse> =>
    apiFetch<ResetPasswordResponse>(`/auth/users/${id}/reset-password`, {
      method: "POST",
    }),
};
