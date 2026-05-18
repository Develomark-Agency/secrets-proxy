import { env } from "cloudflare:workers";
import z from "zod";
import { accessTokenResponseSchema, orgSchema, userSchema } from "./schemas";
import { Context } from "hono";
import { LIFETIME } from "./constants";

function githubHeaders(githubToken: string) {
  return {
    "Authorization": `Bearer ${githubToken}`,
    "Accept": "application/vnd.github.v3+json",
    "User-Agent": `${env.GITHUB_ORG_ID} Secrets Proxy`
  }
}

export async function getOrgs(
  githubToken: string,
  c: Context
) {
  const orgsResponse = await fetch("https://api.github.com/user/orgs", {
    headers: githubHeaders(githubToken)
  });

  if(!orgsResponse.ok) return c.text("GitHub session expired or revoked. Please log in again.", {
    status: 401, statusText: "Unauthorized"
  });

  const orgs = await orgsResponse.json();
  const parsedOrgs = z.array(orgSchema).safeParse(orgs);
  if(!parsedOrgs.success) return c.text("Failed to parse GitHub organization response", {
    status: 500, statusText: "Internal server error"
  });

  return parsedOrgs.data;
}

export function checkUserInOrg(
  orgs: z.output<typeof orgSchema>[],
  c: Context
) {
  if(!orgs.some(org => org.login === env.GITHUB_ORG_ID)) {
    return c.text(`You are not a member of ${env.GITHUB_ORG_ID}`, {
      status: 403,
      statusText: "Forbidden"
    });
  }

  return true;
}

function githubFailedResponse(c: Context) {
  return c.text("Unable to get user data from GitHub. Please try logging in again.", {
    status: 500, statusText: "Internal server error"
  });
}

export async function getUser(
  githubToken: string,
  c: Context
) {
  const userResponse = await fetch("https://api.github.com/user", {
    headers: githubHeaders(githubToken)
  });

  if(!userResponse.ok) return githubFailedResponse(c);

  const userData = await userResponse.json();
  const parsedUser = userSchema.safeParse(userData);
  if(!parsedUser.success) return githubFailedResponse(c);

  return parsedUser.data;
}

export async function getToken(
  code: string,
  c: Context
) {
  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code
    })
  });

  if(!tokenResponse.ok) return githubFailedResponse(c);

  const tokenData = await tokenResponse.json();
  const parsedToken = accessTokenResponseSchema.safeParse(tokenData);

  if(!parsedToken.success || !parsedToken.data.access_token) {
    return c.text("Failed to retrieve GitHub token", {
      status: 401, statusText: "Unauthorized"
    });
  }

  return parsedToken.data.access_token;
}

export function getAuthUrl(
  signedState: string
) {
    const githubAuthUrl = new URL("https://github.com/login/oauth/authorize");
    githubAuthUrl.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
    githubAuthUrl.searchParams.set("scope", "read:org");
    githubAuthUrl.searchParams.set("state", signedState);

    return githubAuthUrl;
}

export function createTokenPayload(username: string) {
  return {
    user: username,
    org: env.GITHUB_ORG_ID,
    exp: Math.floor(Date.now() / 1000) + LIFETIME.ACCESS_TOKEN
  }
}