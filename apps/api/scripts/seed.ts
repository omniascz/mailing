/**
 * Demo seed — minimal but realistic dataset for local exploration and
 * post-deploy smoke tests on a fresh Hetzner Postgres.
 *
 * Usage:
 *   pnpm --filter @forgemsg/api seed              # creates if absent, exits if seeded org exists
 *   SEED_FORCE=1 pnpm --filter @forgemsg/api seed # wipes the seeded org first
 *
 * What it creates:
 *   - 1 organization (slug: 'acme-demo')
 *   - 1 owner user (email: demo@acme.test, password printed at end)
 *   - 6 contacts (CZ names so locale filters have something to chew on)
 *   - 2 lists, 1 segment
 *   - 3 tags
 *   - 1 draft campaign
 *
 * It deliberately stays small. The dashboard renders empty states cleanly,
 * so seed only what's needed to make every nav destination non-empty.
 */
import { db } from '../src/db/client.js';
import {
  organizations,
  users,
  contacts,
  lists,
  contactLists,
  tags,
  contactTags,
  segments,
  campaigns,
} from '../src/db/schema/index.js';
import { eq } from 'drizzle-orm';
import { hashPassword } from '../src/services/auth/password.js';

const ORG_SLUG = 'acme-demo';
const OWNER_EMAIL = 'demo@acme.test';
const OWNER_PASSWORD = 'Demo1234!';

// Platform operator (system_admin role). Lives in the same demo org so
// FK constraints are satisfied, but their role bypasses per-org scoping
// in the /superadmin/* routes. For real production deploy, create this
// user manually with a strong password and unique email.
const SYSADMIN_EMAIL = 'admin@mailforge.test';
const SYSADMIN_PASSWORD = 'SysAdmin1234!';

async function main() {
  const force = process.env.SEED_FORCE === '1';

  // 1) Check for existing seeded org
  const existing = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, ORG_SLUG))
    .limit(1);
  if (existing.length > 0) {
    if (!force) {
      console.log(`✓ Seed org '${ORG_SLUG}' already exists. Re-run with SEED_FORCE=1 to wipe.`);
      process.exit(0);
    }
    console.log(`! SEED_FORCE=1 — deleting existing seeded org '${ORG_SLUG}'…`);
    // ON DELETE CASCADE chains through orgId FKs on all child tables.
    await db.delete(organizations).where(eq(organizations.slug, ORG_SLUG));
  }

  // 2) Org
  console.log('Creating organization…');
  const [org] = await db
    .insert(organizations)
    .values({
      name: 'Acme Demo s.r.o.',
      slug: ORG_SLUG,
      plan: 'pro',
      dataRegion: 'eu',
      settings: { timezone: 'Europe/Prague', locale: 'cs', brandColor: '#2563eb' },
      onboardingCompletedAt: new Date(),
      // The two halves of the compliance footer. Seed data rather than
      // something a test fills in, because three integration files needed them
      // and each filled them in with COALESCE — so the first file to run
      // decided the value and every later assertion was reading someone else's
      // write. See apps/workers/src/integration/setup/seed-org.ts.
      //
      // A campaign sent from a demo org with no address is also just wrong:
      // marketing mail has to carry one, and leaving the column empty made the
      // one deployment anybody actually runs the one that could not.
      companyName: 'Obchod s.r.o.',
      postalAddress: 'Nádražní 1, 110 00 Praha',
    })
    .returning();
  if (!org) throw new Error('Failed to insert organization');

  // 3) Owner user
  console.log('Creating owner user…');
  const passwordHash = await hashPassword(OWNER_PASSWORD);
  await db.insert(users).values({
    orgId: org.id,
    email: OWNER_EMAIL,
    name: 'Demo Owner',
    passwordHash,
    role: 'owner',
    emailVerified: true,
  });

  // 3b) Platform operator (system_admin)
  console.log('Creating platform admin user…');
  const sysadminHash = await hashPassword(SYSADMIN_PASSWORD);
  await db.insert(users).values({
    orgId: org.id, // FK satisfied; role bypasses per-org scoping
    email: SYSADMIN_EMAIL,
    name: 'Platform Admin',
    passwordHash: sysadminHash,
    role: 'system_admin',
    emailVerified: true,
  });

  // 4) Tags
  console.log('Creating tags…');
  const tagRows = await db
    .insert(tags)
    .values([
      { orgId: org.id, name: 'VIP', color: '#f59e0b' },
      { orgId: org.id, name: 'Newsletter', color: '#2563eb' },
      { orgId: org.id, name: 'Prospect', color: '#10b981' },
    ])
    .returning();

  // 5) Contacts — six CZ-flavored rows
  console.log('Creating contacts…');
  const contactSeed = [
    { firstName: 'Adéla', lastName: 'Nováková', email: 'adela.novakova@example.test', tagIdx: 0 },
    { firstName: 'Jan', lastName: 'Svoboda', email: 'jan.svoboda@example.test', tagIdx: 1 },
    { firstName: 'Petra', lastName: 'Dvořáková', email: 'petra.dvorakova@example.test', tagIdx: 0 },
    { firstName: 'Tomáš', lastName: 'Procházka', email: 'tomas.prochazka@example.test', tagIdx: 1 },
    { firstName: 'Markéta', lastName: 'Černá', email: 'marketa.cerna@example.test', tagIdx: 2 },
    { firstName: 'Pavel', lastName: 'Veselý', email: 'pavel.vesely@example.test', tagIdx: 2 },
  ];
  const contactRows = await db
    .insert(contacts)
    .values(
      contactSeed.map((c, i) => ({
        orgId: org.id,
        email: c.email,
        firstName: c.firstName,
        lastName: c.lastName,
        status: 'active' as const,
        lifecycleStage: (i < 2 ? 'customer' : i < 4 ? 'opportunity' : 'subscriber') as
          | 'customer'
          | 'opportunity'
          | 'subscriber',
        preferredLocale: 'cs',
        source: 'seed',
      })),
    )
    .returning();

  // 5a) Contact ↔ Tag links
  await db.insert(contactTags).values(
    contactSeed.map((c, i) => ({
      contactId: contactRows[i]!.id,
      tagId: tagRows[c.tagIdx]!.id,
    })),
  );

  // 6) Lists
  console.log('Creating lists…');
  const listRows = await db
    .insert(lists)
    .values([
      { orgId: org.id, name: 'Hlavní seznam', description: 'Všichni odběratelé novinek.' },
      {
        orgId: org.id,
        name: 'VIP klienti',
        description: 'Top zákazníci, dostávají věrnostní nabídky.',
      },
    ])
    .returning();

  // 6a) Memberships — all in main, 0+2 in VIP
  await db.insert(contactLists).values([
    ...contactRows.map((c) => ({
      contactId: c.id,
      listId: listRows[0]!.id,
      confirmedAt: new Date(),
    })),
    { contactId: contactRows[0]!.id, listId: listRows[1]!.id, confirmedAt: new Date() },
    { contactId: contactRows[2]!.id, listId: listRows[1]!.id, confirmedAt: new Date() },
  ]);

  // 7) Segment — simple "active customers"
  console.log('Creating segment…');
  await db.insert(segments).values({
    orgId: org.id,
    name: 'Aktivní zákazníci',
    description: 'lifecycle_stage = customer AND status = active',
    conditions: {
      operator: 'AND',
      rules: [
        { field: 'lifecycle_stage', op: 'eq', value: 'customer' },
        { field: 'status', op: 'eq', value: 'active' },
      ],
    },
  });

  // 8) Campaign — draft so user can immediately edit + send a test
  console.log('Creating draft campaign…');
  await db.insert(campaigns).values({
    orgId: org.id,
    name: 'Vítací email — demo',
    type: 'email',
    status: 'draft',
    subject: 'Vítejte v Mailforge, {{contact.first_name | vocative}}!',
    preheader: 'Tady je rychlý úvod k tomu, co u nás najdete.',
    fromName: 'Acme Demo',
    fromEmail: 'hello@acme.test',
    listId: listRows[0]!.id,
    content: {
      html:
        '<!doctype html><html><body style="font-family:Arial,sans-serif">' +
        '<h1>Vítejte, {{contact.first_name | vocative}}!</h1>' +
        '<p>Tohle je demo kampaň. Otevřete vizuální editor a upravte ji podle sebe.</p>' +
        '</body></html>',
    },
  });

  console.log('\n✓ Seed complete.');
  console.log('─────────────────────────────────────────');
  console.log('Tenant owner (per-org dashboard):');
  console.log(`  ${OWNER_EMAIL} / ${OWNER_PASSWORD}`);
  console.log('Platform admin (/superadmin/* routes):');
  console.log(`  ${SYSADMIN_EMAIL} / ${SYSADMIN_PASSWORD}`);
  console.log(`Org slug: ${ORG_SLUG}`);
  console.log('─────────────────────────────────────────');
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
