import z from "zod";

// common

export const portSchema = z.coerce.number()
  .int()
  .min(0)
  .max(65535);

export const payloadSchema = z.object({
  exp: z.number(),
  org: z.string(),
  user: z.string()
});

export const sessionSchema = z.object({
  username: z.string(),
  githubToken: z.string()
});


// request

export const loginQuerySchema = z.object({
  cli_port: portSchema,
  nonce: z.string()
});

export const callbackQuerySchema = z.object({
  code: z.string(),
  state: z.string()
});

export const refreshBodySchema = z.object({
  refreshToken: z.string()
});


// response

export const stateSchema = z.object({
  port: portSchema,
  nonce: z.string(),
  exp: z.number()
});

export const accessTokenResponseSchema = z.object({
  access_token: z.string()
});

export const orgSchema = z.object({
  login: z.string()
});

export const userSchema = z.object({
  login: z.string()
});


// API keys

export const apiKeySchema = z.object({
  headers: z.record(z.string(), z.string()),
  query: z.record(z.string(), z.string())
});