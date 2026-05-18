import z from "zod";

export const callbackQuerySchema = z.object({
  token: z.string(),
  refresh: z.string(),
  nonce: z.string(),
  refresh_exp: z.coerce.date()
});

export const tokenCredentialsSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  refreshExp: z.coerce.date()
});

export type TokenCredentials = z.output<typeof tokenCredentialsSchema>

export const tokenSchema = z.object({
  exp: z.number().transform(x => new Date(x * 1000)),
  org: z.string(),
  user: z.string()
});