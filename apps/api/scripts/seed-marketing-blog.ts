/**
 * Marketing blog seed (Sprint H.8) — 10 SEO posts for the public marketing
 * site (`mailforge-marketing` org). Targets "how to migrate from X" and
 * "X vs MailForge" search intent for CZ + global audiences.
 *
 * Usage:
 *   pnpm --filter @forgemsg/api seed:marketing-blog
 *   SEED_FORCE=1 pnpm --filter @forgemsg/api seed:marketing-blog
 *
 * Idempotent: re-runs upsert posts by slug+locale within the platform org.
 * The org/author/category bootstrap happens once and stays put.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../src/db/client.js';
import { organizations, blogAuthors, blogCategories, blogPosts } from '../src/db/schema/index.js';
import { MARKETING_POSTS } from '../src/seeds/marketing-blog/posts.js';

const PLATFORM_ORG_SLUG = 'mailforge-marketing';
const PLATFORM_ORG_NAME = 'MailForge Marketing';
const AUTHOR_SLUG = 'mailforge-team';

async function ensurePlatformOrg(): Promise<string> {
  const [existing] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, PLATFORM_ORG_SLUG))
    .limit(1);
  if (existing) return existing.id;

  const [row] = await db
    .insert(organizations)
    .values({
      name: PLATFORM_ORG_NAME,
      slug: PLATFORM_ORG_SLUG,
      plan: 'enterprise',
      dataRegion: 'eu',
      settings: { timezone: 'Europe/Prague', locale: 'cs' },
      onboardingCompletedAt: new Date(),
    })
    .returning({ id: organizations.id });
  console.log(`+ Created platform marketing org (${PLATFORM_ORG_SLUG})`);
  return row!.id;
}

async function ensureAuthor(orgId: string): Promise<string> {
  const [existing] = await db
    .select({ id: blogAuthors.id })
    .from(blogAuthors)
    .where(and(eq(blogAuthors.orgId, orgId), eq(blogAuthors.slug, AUTHOR_SLUG)))
    .limit(1);
  if (existing) return existing.id;
  const [row] = await db
    .insert(blogAuthors)
    .values({
      orgId,
      slug: AUTHOR_SLUG,
      displayName: 'MailForge Team',
      bio: 'The MailForge team writes about email deliverability, migration, and ESP comparisons for European senders.',
    })
    .returning({ id: blogAuthors.id });
  console.log('+ Created default author "MailForge Team"');
  return row!.id;
}

async function ensureCategory(orgId: string, slug: string, name: string): Promise<string> {
  const [existing] = await db
    .select({ id: blogCategories.id })
    .from(blogCategories)
    .where(and(eq(blogCategories.orgId, orgId), eq(blogCategories.slug, slug)))
    .limit(1);
  if (existing) return existing.id;
  const [row] = await db
    .insert(blogCategories)
    .values({ orgId, slug, name })
    .returning({ id: blogCategories.id });
  console.log(`+ Created category "${name}"`);
  return row!.id;
}

async function upsertPost(
  orgId: string,
  authorId: string,
  categories: Record<string, string>,
  post: (typeof MARKETING_POSTS)[number],
): Promise<'inserted' | 'updated'> {
  const categoryId = categories[post.category];
  if (!categoryId) throw new Error(`Unknown category "${post.category}" for ${post.slug}`);

  const [existing] = await db
    .select({ id: blogPosts.id })
    .from(blogPosts)
    .where(
      and(
        eq(blogPosts.orgId, orgId),
        eq(blogPosts.slug, post.slug),
        eq(blogPosts.locale, post.locale),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(blogPosts)
      .set({
        title: post.title,
        body: post.body,
        excerpt: post.excerpt,
        metaTitle: post.metaTitle,
        metaDescription: post.metaDescription,
        tags: post.tags,
        categoryId,
        authorId,
        status: 'published',
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(blogPosts.id, existing.id));
    return 'updated';
  }

  await db.insert(blogPosts).values({
    orgId,
    slug: post.slug,
    title: post.title,
    body: post.body,
    excerpt: post.excerpt,
    metaTitle: post.metaTitle,
    metaDescription: post.metaDescription,
    tags: post.tags,
    categoryId,
    authorId,
    locale: post.locale,
    status: 'published',
    publishedAt: new Date(),
  });
  return 'inserted';
}

async function main() {
  console.log('— Marketing blog seed —');
  const orgId = await ensurePlatformOrg();
  const authorId = await ensureAuthor(orgId);
  const categories: Record<string, string> = {
    migration: await ensureCategory(orgId, 'migration', 'Migration guides'),
    comparisons: await ensureCategory(orgId, 'comparisons', 'Comparisons'),
    deliverability: await ensureCategory(orgId, 'deliverability', 'Deliverability'),
  };

  let inserted = 0;
  let updated = 0;
  for (const post of MARKETING_POSTS) {
    const r = await upsertPost(orgId, authorId, categories, post);
    if (r === 'inserted') {
      console.log(`+ ${post.locale} — ${post.slug}`);
      inserted++;
    } else {
      console.log(`~ ${post.locale} — ${post.slug} (updated)`);
      updated++;
    }
  }

  console.log(
    `\nDone. ${inserted} new, ${updated} updated, ${MARKETING_POSTS.length} total in ${PLATFORM_ORG_SLUG}.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
