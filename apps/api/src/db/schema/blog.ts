import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { users } from './users.js';

/**
 * Blog platform (#336/#412). Headless/API-first — content is served through
 * the org's Next.js/WordPress/custom frontend. We store the canonical posts,
 * categories, tags, authors, and version history.
 */

export const blogPostStatusEnum = pgEnum('blog_post_status', [
  'draft',
  'published',
  'scheduled',
  'archived',
]);

export const blogCategories = pgTable(
  'blog_categories',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    slug: varchar('slug', { length: 128 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    parentId: uuid('parent_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('blog_categories_org_slug_uq').on(t.orgId, t.slug),
    index('blog_categories_org_idx').on(t.orgId),
  ],
);

export const blogAuthors = pgTable(
  'blog_authors',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    slug: varchar('slug', { length: 128 }).notNull(),
    displayName: varchar('display_name', { length: 255 }).notNull(),
    bio: text('bio'),
    avatarUrl: text('avatar_url'),
    socialLinks: jsonb('social_links').$type<Record<string, string>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('blog_authors_org_slug_uq').on(t.orgId, t.slug),
    index('blog_authors_user_idx').on(t.userId),
  ],
);

export const blogPosts = pgTable(
  'blog_posts',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id').references(() => blogAuthors.id, { onDelete: 'set null' }),
    categoryId: uuid('category_id').references(() => blogCategories.id, { onDelete: 'set null' }),

    slug: varchar('slug', { length: 255 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    excerpt: text('excerpt'),
    /** Markdown or HTML body, rendered by the frontend. */
    body: text('body').notNull(),
    /** Hero image URL. */
    heroImageUrl: text('hero_image_url'),

    /** Translation group id (shared across locale variants). */
    translationGroupId: uuid('translation_group_id'),
    locale: varchar('locale', { length: 16 }).notNull().default('en'),

    status: blogPostStatusEnum('status').notNull().default('draft'),

    /** SEO */
    metaTitle: varchar('meta_title', { length: 255 }),
    metaDescription: varchar('meta_description', { length: 512 }),
    canonicalUrl: text('canonical_url'),

    /** Freeform tags (no separate junction table — kept as JSON array). */
    tags: jsonb('tags').$type<string[]>().notNull().default([]),

    publishedAt: timestamp('published_at', { withTimezone: true }),
    /** Scheduled publish time (used when status = 'scheduled'). */
    scheduledPublishAt: timestamp('scheduled_publish_at', { withTimezone: true }),

    /** Current version number; incremented on each publish. */
    version: varchar('version', { length: 16 }).notNull().default('1'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('blog_posts_org_slug_locale_uq').on(t.orgId, t.slug, t.locale),
    index('blog_posts_org_status_idx').on(t.orgId, t.status),
    index('blog_posts_org_category_idx').on(t.orgId, t.categoryId),
    index('blog_posts_org_published_at_idx').on(t.orgId, t.publishedAt),
    index('blog_posts_translation_group_idx').on(t.translationGroupId),
  ],
);

/** Version history — written on every publish so we can roll back. */
export const blogPostRevisions = pgTable(
  'blog_post_revisions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    postId: uuid('post_id').notNull().references(() => blogPosts.id, { onDelete: 'cascade' }),
    version: varchar('version', { length: 16 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    body: text('body').notNull(),
    excerpt: text('excerpt'),
    savedByUserId: uuid('saved_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('blog_post_revisions_post_version_uq').on(t.postId, t.version),
    index('blog_post_revisions_post_idx').on(t.postId),
  ],
);

export type BlogCategory = typeof blogCategories.$inferSelect;
export type BlogAuthor = typeof blogAuthors.$inferSelect;
export type BlogPost = typeof blogPosts.$inferSelect;
export type NewBlogPost = typeof blogPosts.$inferInsert;
export type BlogPostRevision = typeof blogPostRevisions.$inferSelect;
