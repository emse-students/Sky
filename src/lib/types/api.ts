export interface User {
  id: number;
  email: string;
  name: string;
  profile_id: string | null;
  role: 'admin' | 'user';
  first_login: number;
  avatar?: string;
}

export interface Session {
  token: string;
  user_id: number;
  expires_at: number;
}
