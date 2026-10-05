import { ArticleOrmEntity } from 'src/article/infrastructure/entities/typeorm/article.entity';
import { In } from 'typeorm';

import dataSource from '../data-source';

import { reportSeedFailure, runSeedCli } from './seed-runner';

/**
 * Five published, representative health-tip articles so the articles list
 * and detail endpoints have something browsable in dev without hand-entering
 * rows. Upserted by `slug` (which already carries a `UNIQUE` constraint), so
 * re-running this script updates the same five rows in place rather than
 * creating duplicates.
 */
const ARTICLES: Partial<ArticleOrmEntity>[] = [
  {
    slug: 'understanding-blood-pressure-numbers',
    title: 'Understanding Your Blood Pressure Numbers',
    excerpt:
      'What systolic and diastolic readings actually mean, and when a number is worth calling your doctor about.',
    body: 'Blood pressure is written as two numbers: systolic (the pressure while your heart beats) over diastolic (the pressure while it rests between beats). A reading consistently at or above 140/90 mmHg is generally considered high and worth discussing with a doctor, while a single high reading taken when you are stressed or just after exercise is rarely a cause for alarm on its own. Tracking your numbers over a few mornings at the same time of day gives a far more useful picture than any single reading.',
    coverImage: null,
    isPublished: true,
    publishedAt: new Date('2026-01-10T08:00:00.000Z'),
    authorName: 'Dr. Amina Farouk',
  },
  {
    slug: 'five-habits-for-better-sleep',
    title: '5 Simple Habits for Better Sleep',
    excerpt:
      'Small, consistent changes that make it easier to fall asleep and stay asleep — no special equipment required.',
    body: 'Going to bed and waking up at the same time every day, even on weekends, is the single biggest lever most people have over their sleep quality. Beyond that: keep the bedroom cool and dark, stop caffeine by early afternoon, give yourself twenty screen-free minutes before bed, and save the bed for sleep rather than scrolling or working. None of these habits require any special equipment, and most people notice a difference within a week or two of sticking to them.',
    coverImage: null,
    isPublished: true,
    publishedAt: new Date('2026-01-17T08:00:00.000Z'),
    authorName: 'Dr. Youssef Hassan',
  },
  {
    slug: 'when-to-see-a-doctor-for-a-headache',
    title: 'When to See a Doctor for a Headache',
    excerpt:
      'Most headaches are harmless, but a few warning signs mean you should seek care the same day.',
    body: 'The overwhelming majority of headaches are tension headaches or migraines that respond to rest, hydration, and over-the-counter pain relief. Seek care the same day if a headache is the worst you have ever had, comes on suddenly like a thunderclap, follows a head injury, or arrives together with a stiff neck, fever, confusion, or vision changes. If headaches are becoming more frequent or are starting to interfere with work or sleep, that pattern on its own is worth a conversation with a doctor, even without any of the warning signs above.',
    coverImage: null,
    isPublished: true,
    publishedAt: new Date('2026-01-24T08:00:00.000Z'),
    authorName: 'Dr. Laila Mostafa',
  },
  {
    slug: 'staying-hydrated-through-every-season',
    title: 'Staying Hydrated Through Every Season',
    excerpt:
      "Why your water needs change with the weather and your activity level, and how to tell you're drinking enough.",
    body: 'Thirst is a late signal, not an early one — by the time you feel thirsty, you are usually already mildly dehydrated. A simple check is the color of your urine: pale yellow generally means you are well hydrated, while dark yellow is a sign to drink more. Needs go up in hot weather, at altitude, and with exercise, so it is worth drinking a bit more proactively on those days rather than waiting for thirst to prompt you.',
    coverImage: null,
    isPublished: true,
    publishedAt: new Date('2026-01-31T08:00:00.000Z'),
    authorName: 'Dr. Youssef Hassan',
  },
  {
    slug: 'a-beginners-guide-to-reading-food-labels',
    title: "A Beginner's Guide to Reading Food Labels",
    excerpt:
      'How to quickly scan a nutrition label for what actually matters, without getting lost in the numbers.',
    body: 'Start with the serving size at the top of the label — every other number on it is relative to that amount, and it is easy to underestimate how many servings are actually in a package. From there, the ingredients list is usually more informative than any single nutrient count: ingredients are listed by weight, so whatever is listed first makes up the largest share of the product. Added sugar, sodium, and saturated fat are the three figures most worth comparing between similar products when you are choosing between them.',
    coverImage: null,
    isPublished: true,
    publishedAt: new Date('2026-02-07T08:00:00.000Z'),
    authorName: 'Dr. Amina Farouk',
  },
];

export async function seedArticles(): Promise<void> {
  const repo = dataSource.getRepository(ArticleOrmEntity);
  await repo.upsert(ARTICLES, ['slug']);

  const rows = await repo.find({
    where: { slug: In(ARTICLES.map((article) => article.slug as string)) },
    select: { id: true, slug: true, title: true },
  });

  console.log(`Articles ready (${ARTICLES.length} published):`);
  for (const article of ARTICLES) {
    const row = rows.find((r) => r.slug === article.slug);
    console.log(
      `  GET /articles/${row?.id ?? '(missing)'}  — ${article.title}`,
    );
  }
}

if (require.main === module) {
  runSeedCli(seedArticles).catch(reportSeedFailure);
}
