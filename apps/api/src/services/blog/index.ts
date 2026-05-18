/**
 * Blog service (#336/#412).
 *
 * CRUD + publish lifecycle for posts + categories + authors. Delegates
 * math to `pure.ts` (slug, excerpt, read-time).
 */

import { and, desc, eq, isNull, ne } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  blogPosts,
  blogCategories,
  blogAuthors,
  blogPostRevisions,
  type BlogPost,
} from '../../db/schema/blog.js';
import { AppError } from '../../lib/app-error.js';
import {
  slugify,
  uniqueSlug,
  extractExcerpt,
  isDueToPublish,
} from './pure.js';

// ─── Categories ─────────────────────────────────────────────────────────────

export async function listCategories(orgId: string) {
  return db.select().from(blogCategories).where(eq(blogCategories.orgId, orgId));
}

export async function createCategory(
  orgId: string,
  input: { name: string; description?: string; parentId?: string },
) {
  const slug = await allocateUniqueCategorySlug(orgId, slugify(input.name));
  const [row] = await db
    .insert(blogCategories)
    .values({ orgId, slug, ...input })
    .returning();
  return row!;
}

async function allocateUniqueCategorySlug(orgId: string, base: string) {
  const rows = await db
    .select({ slug: blogCategories.slug })
    .from(blogCategories)
    .where(eq(blogCategories.orgId, orgId));
  return uniqueSlug(base, new Set(rows.map((r) => r.slug)));
}

// ─── Authors ────────────────────────────────────────────────────────────────

export async function listAuthors(orgId: string) {
  return db.select().from(blogAuthors).where(eq(blogAuthors.orgId, orgId));
}

export async function createAuthor(
  orgId: string,
  input: {
    displayName: string;
    userId?: string;
    bio?: string;
    avatarUrl?: string;
    socialLinks?: Record<string, string>;
  },
) {
  const slugBase = slugify(input.displayName);
  const rows = await db
    .select({ slug: blogAuthors.slug })
    .from(blogAuthors)
    .where(eq(blogAuthors.orgId, orgId));
  const slug = uniqueSlug(slugBase, new Set(rows.map((r) => r.slug)));
  const [row] = await db
    .insert(blogAuthors)
    .values({ orgId, slug, ...input, socialLinks: input.socialLinks ?? {} })
    .returning();
  return row!;
}

// ─── Posts ──────────────────────────────────────────────────────────────────

export interface CreatePostInput {
  title: string;
  body: string;
  excerpt?: string;
  authorId?: string;
  categoryId?: string;
  heroImageUrl?: string;
  tags?: string[];
  metaTitle?: string;
  metaDescription?: string;
  canonicalUrl?: string;
  locale?: string;
  translationGroupId?: string;
}

export async function createPost(orgId: string, input: CreatePostInput): Promise<BlogPost> {
  const slugBase = slugify(input.title);
  const slug = await allocateUniquePostSlug(orgId, slugBase, input.locale ?? 'en');
  const excerpt = input.excerpt ?? extractExcerpt(input.body);
  const [row] = await db
    .insert(blogPosts)
    .values({
      orgId,
      slug,
      title: input.title,
      body: input.body,
      excerpt,
      ...(input.authorId ? { authorId: input.authorId } : {}),
      ...(input.categoryId ? { categoryId: input.categoryId } : {}),
      ...(input.heroImageUrl ? { heroImageUrl: input.heroImageUrl } : {}),
      ...(input.tags ? { tags: input.tags } : {}),
      ...(input.metaTitle ? { metaTitle: input.metaTitle } : {}),
      ...(input.metaDescription ? { metaDescription: input.metaDescription } : {}),
      ...(input.canonicalUrl ? { canonicalUrl: input.canonicalUrl } : {}),
      locale: input.locale ?? 'en',
      ...(input.translationGroupId ? { translationGroupId: input.translationGroupId } : {}),
    })
    .returning();
  return row!;
}

async function allocateUniquePostSlug(orgId: string, base: string, locale: string) {
  const rows = await db
    .select({ slug: blogPosts.slug })
    .from(blogPosts)
    .where(
      and(
        eq(blogPosts.orgId, orgId),
        eq(blogPosts.locale, locale),
        isNull(blogPosts.deletedAt),
      ),
    );
  return uniqueSlug(base, new Set(rows.map((r) => r.slug)));
}

export async function updatePost(
  orgId: string,
  postId: string,
  input: Partial<CreatePostInput> & { status?: 'draft' | 'scheduled' | 'archived' },
): Promise<BlogPost> {
  const [existing] = await db
    .select()
    .from(blogPosts)
    .where(
      and(eq(blogPosts.orgId, orgId), eq(blogPosts.id, postId), isNull(blogPosts.deletedAt)),
    )
    .limit(1);
  if (!existing) throw AppError.notFound('Blog post');

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.title) patch.title = input.title;
  if (input.body) {
    patch.body = input.body;
    if (!input.excerpt) patch.excerpt = extractExcerpt(input.body);
  }
  if (input.excerpt !== undefined) patch.excerpt = input.excerpt;
  if (input.heroImageUrl !== undefined) patch.heroImageUrl = input.heroImageUrl;
  if (input.tags) patch.tags = input.tags;
  if (input.metaTitle !== undefined) patch.metaTitle = input.metaTitle;
  if (input.metaDescription !== undefined) patch.metaDescription = input.metaDescription;
  if (input.canonicalUrl !== undefined) patch.canonicalUrl = input.canonicalUrl;
  if (input.status) patch.status = input.status;

  const [updated] = await db
    .update(blogPosts)
    .set(patch)
    .where(eq(blogPosts.id, postId))
    .returning();
  return updated!;
}

export async function publishPost(
  orgId: string,
  postId: string,
  savedByUserId?: string,
): Promise<BlogPost> {
  const [existing] = await db
    .select()
    .from(blogPosts)
    .where(
      and(eq(blogPosts.orgId, orgId), eq(blogPosts.id, postId), isNull(blogPosts.deletedAt)),
    )
    .limit(1);
  if (!existing) throw AppError.notFound('Blog post');

  const nextVersion = String(Number(existing.version) + 1);

  // Snapshot previous version
  await db.insert(blogPostRevisions).values({
    postId,
    version: existing.version,
    title: existing.title,
    body: existing.body,
    excerpt: existing.excerpt,
    ...(savedByUserId ? { savedByUserId } : {}),
  });

  const [row] = await db
    .update(blogPosts)
    .set({
      status: 'published',
      version: nextVersion,
      publishedAt: existing.publishedAt ?? new Date(),
      updatedAt: new Date(),
    })
    .where(eq(blogPosts.id, postId))
    .returning();
  return row!;
}

export async function schedulePost(
  orgId: string,
  postId: string,
  publishAt: Date,
): Promise<BlogPost> {
  const [row] = await db
    .update(blogPosts)
    .set({
      status: 'scheduled',
      scheduledPublishAt: publishAt,
      updatedAt: new Date(),
    })
    .where(
      and(eq(blogPosts.orgId, orgId), eq(blogPosts.id, postId), isNull(blogPosts.deletedAt)),
    )
    .returning();
  if (!row) throw AppError.notFound('Blog post');
  return row;
}

export async function archivePost(orgId: string, postId: string): Promise<void> {
  await db
    .update(blogPosts)
    .set({ status: 'archived', updatedAt: new Date() })
    .where(and(eq(blogPosts.orgId, orgId), eq(blogPosts.id, postId)));
}

export async function deletePost(orgId: string, postId: string): Promise<void> {
  await db
    .update(blogPosts)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(blogPosts.orgId, orgId), eq(blogPosts.id, postId)));
}

export async function listPosts(
  orgId: string,
  opts: { status?: 'draft' | 'published' | 'scheduled' | 'archived'; limit?: number } = {},
) {
  const conds = [eq(blogPosts.orgId, orgId), isNull(blogPosts.deletedAt)];
  if (opts.status) conds.push(eq(blogPosts.status, opts.status));
  return db
    .select()
    .from(blogPosts)
    .where(and(...conds))
    .orderBy(desc(blogPosts.updatedAt))
    .limit(opts.limit ?? 50);
}

export async function getPost(orgId: string, postId: string) {
  const [row] = await db
    .select()
    .from(blogPosts)
    .where(
      and(eq(blogPosts.orgId, orgId), eq(blogPosts.id, postId), isNull(blogPosts.deletedAt)),
    )
    .limit(1);
  if (!row) throw AppError.notFound('Blog post');
  return row;
}

export async function getPostBySlug(orgId: string, slug: string, locale = 'en') {
  const [row] = await db
    .select()
    .from(blogPosts)
    .where(
      and(
        eq(blogPosts.orgId, orgId),
        eq(blogPosts.slug, slug),
        eq(blogPosts.locale, locale),
        isNull(blogPosts.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

// ─── Scheduled auto-publish (called by cron worker) ────────────────────────

export async function publishDuePosts(): Promise<number> {
  const now = new Date();
  const rows = await db
    .select()
    .from(blogPosts)
    .where(and(eq(blogPosts.status, 'scheduled'), isNull(blogPosts.deletedAt)));

  let published = 0;
  for (const post of rows) {
    if (!isDueToPublish(post.status, post.scheduledPublishAt, now)) continue;
    await db
      .update(blogPosts)
      .set({
        status: 'published',
        publishedAt: post.publishedAt ?? now,
        updatedAt: now,
      })
      .where(eq(blogPosts.id, post.id));
    published++;
  }
  return published;
}

// silence unused helper
void ne;
