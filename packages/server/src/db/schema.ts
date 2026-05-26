import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const logs = sqliteTable("logs", {
  id: text().primaryKey().$default(() => crypto.randomUUID()),
  ts: text().notNull().$default(() => new Date().toISOString()),
  data: text({ mode: "json" }).$type()
});