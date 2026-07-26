export interface Env {
  DB: D1Database;
  JWT_SECRET: string;
  RESEND_API_KEY: string;
  APP_BASE_URL: string;
  ALLOWED_ORIGINS: string;
}
