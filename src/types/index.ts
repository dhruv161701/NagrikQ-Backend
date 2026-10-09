import { Request } from 'express';

export type UserRole = 'citizen' | 'employee' | 'admin' | 'superadmin';
export type UIMode = 'modern' | 'simple';
export type LanguageCode = 'en' | 'gu' | 'hi';

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  onboardingCompleted?: boolean;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}
