import { HTTPException } from "hono/http-exception"
import type { Hook } from "@hono/standard-validator";

export function throwOnStandardError<T1, T2, T3, T4, T5>() {
  return (
    result => {
      if(!result.success) {
        throw new HTTPException(400, {
          message: "Validation failed",
          cause: result.error
        })
      }
    }
  ) as Hook<T1 & any, T2 & any, T3 & any, T4 & any, T5 & any>
}