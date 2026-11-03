import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const sec13fCache = sqliteTable("sec13f_cache", {
  cacheKey: text("cache_key").primaryKey(),
  payload: text("payload").notNull(),
  updatedAt: text("updated_at").notNull(),
});
