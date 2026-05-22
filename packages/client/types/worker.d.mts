//#region src/worker.d.ts
declare const app: import("hono/hono-base").HonoBase<import("hono/types").BlankEnv, import("hono/types").BlankSchema | import("hono/types").MergeSchemaPath<{
  "/": {
    $get: {
      input: {
        query: {
          cli_port: string | string[];
          nonce: string | string[];
        };
      };
      output: undefined;
      outputFormat: "redirect";
      status: 302;
    };
  };
}, "/login"> | import("hono/types").MergeSchemaPath<{
  "/": {
    $get: {
      input: {
        query: {
          code: string;
          state: string;
        };
      };
      output: undefined;
      outputFormat: "redirect";
      status: 302;
    } | {
      input: {
        query: {
          code: string;
          state: string;
        };
      };
      output: "Invalid, tampered, or expired state";
      outputFormat: "text";
      status: 403;
    } | {
      input: {
        query: {
          code: string;
          state: string;
        };
      };
      output: "Unable to get user data from GitHub. Please try logging in again.";
      outputFormat: "text";
      status: 500;
    } | {
      input: {
        query: {
          code: string;
          state: string;
        };
      };
      output: "Failed to retrieve GitHub token";
      outputFormat: "text";
      status: 401;
    } | {
      input: {
        query: {
          code: string;
          state: string;
        };
      };
      output: "GitHub session expired or revoked. Please log in again.";
      outputFormat: "text";
      status: 401;
    } | {
      input: {
        query: {
          code: string;
          state: string;
        };
      };
      output: "Failed to parse GitHub organization response";
      outputFormat: "text";
      status: 500;
    } | {
      input: {
        query: {
          code: string;
          state: string;
        };
      };
      output: `You are not a member of ${any}`;
      outputFormat: "text";
      status: 403;
    };
  };
}, "/callback"> | import("hono/types").MergeSchemaPath<{
  "/": {
    $post: {
      input: {
        json: {
          refreshToken: string;
        };
      };
      output: "GitHub session expired or revoked. Please log in again.";
      outputFormat: "text";
      status: 401;
    } | {
      input: {
        json: {
          refreshToken: string;
        };
      };
      output: "Failed to parse GitHub organization response";
      outputFormat: "text";
      status: 500;
    } | {
      input: {
        json: {
          refreshToken: string;
        };
      };
      output: `You are not a member of ${any}`;
      outputFormat: "text";
      status: 403;
    } | {
      input: {
        json: {
          refreshToken: string;
        };
      };
      output: "Invalid or expired refresh token";
      outputFormat: "text";
      status: 401;
    } | {
      input: {
        json: {
          refreshToken: string;
        };
      };
      output: {
        access_token: string;
        refresh_token: `${string}-${string}-${string}-${string}-${string}`;
        refresh_exp: string;
      };
      outputFormat: "json";
      status: import("hono/utils/http-status").ContentfulStatusCode;
    };
  };
}, "/refresh"> | import("hono/types").MergeSchemaPath<{
  "/": {
    $get: {
      input: {};
      output: "pong";
      outputFormat: "text";
      status: import("hono/utils/http-status").ContentfulStatusCode;
    };
  };
}, "/ping"> | import("hono/types").MergeSchemaPath<{
  "/*": {
    $all: {
      input: {};
      output: {};
      outputFormat: string;
      status: import("hono/utils/http-status").StatusCode;
    };
  };
}, "/proxy">, "/", "/">;
//#endregion
export { app as default };