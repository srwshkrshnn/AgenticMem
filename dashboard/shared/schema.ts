import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const memories = pgTable("memories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  content: text("content").notNull(),
  source: text("source").notNull(), // e.g., "outlook", "chatgpt", "notion"
  tags: text("tags").array().default([]),
  metadata: jsonb("metadata").default({}), // Additional structured data
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const appIntegrations = pgTable("app_integrations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(), // e.g., "outlook", "chatgpt"
  type: text("type").notNull(), // "api" or "extension"
  enabled: boolean("enabled").default(false),
  settings: jsonb("settings").default({}),
  lastSync: timestamp("last_sync"),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertMemorySchema = createInsertSchema(memories).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAppIntegrationSchema = createInsertSchema(appIntegrations).omit({
  id: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Memory = typeof memories.$inferSelect;
export type InsertMemory = z.infer<typeof insertMemorySchema>;
export type AppIntegration = typeof appIntegrations.$inferSelect;
export type InsertAppIntegration = z.infer<typeof insertAppIntegrationSchema>;
