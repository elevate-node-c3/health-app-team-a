import { hash } from 'argon2';

import dataSource from '../data-source';

import { reportSeedFailure, runSeedCli } from './seed-runner';

/**
 * Sign-in ready accounts for local work and Postman. Every account shares one
 * password so the collection's {{email}}/{{password}} pair only ever needs the
 * email swapped.
 */
const PASSWORD = 'Password123!';

interface SeedUser {
  name: string;
  email: string;
  phone: string;
  gender: 'MALE' | 'FEMALE';
  isActive: boolean;
  isVerified: boolean;
  note: string;
}

const USERS: SeedUser[] = [
  {
    name: 'Nour Patient',
    email: 'nour@example.com',
    phone: '+201100000001',
    gender: 'MALE',
    isActive: true,
    isVerified: true,
    note: 'default happy-path account — verified, use for login/search/booking',
  },
  {
    name: 'Mona Patient',
    email: 'mona@example.com',
    phone: '+201100000002',
    gender: 'FEMALE',
    isActive: true,
    isVerified: true,
    note: 'second verified account — favourites, search history isolation',
  },
  {
    name: 'Unverified Patient',
    email: 'unverified@example.com',
    phone: '+201100000003',
    gender: 'MALE',
    isActive: true,
    isVerified: false,
    note: 'never verified — exercises the verify-email / resend flows',
  },
  {
    name: 'Deactivated Patient',
    email: 'deactivated@example.com',
    phone: '+201100000004',
    gender: 'FEMALE',
    isActive: false,
    isVerified: true,
    note: 'isActive=false — exercises the blocked-login path',
  },
];

export async function seedUsers(): Promise<void> {
  // One hash for all of them: argon2 is deliberately slow, and these are
  // throwaway local credentials.
  const passwordHash = await hash(PASSWORD);

  for (const user of USERS) {
    // Matched on email rather than ON CONFLICT: only the phone index is unique
    // in the schema, so an email collision would not raise a conflict to catch.
    await dataSource.query(
      `INSERT INTO users (name, email, phone, password, gender, "isActive", "isVerified")
       SELECT $1, $2::varchar, $3, $4, $5, $6, $7
       WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = $2::varchar)`,
      [
        user.name,
        user.email,
        user.phone,
        passwordHash,
        user.gender,
        user.isActive,
        user.isVerified,
      ],
    );
  }

  const rows = await dataSource.query<{ id: string; email: string }[]>(
    `SELECT id, email FROM users WHERE email = ANY($1::varchar[]) ORDER BY email`,
    [USERS.map((u) => u.email)],
  );

  console.log(`Users ready (password for all: ${PASSWORD})`);
  for (const user of USERS) {
    const row = rows.find((r) => r.email === user.email);
    console.log(`  ${user.email}  ${row?.id ?? '(missing)'}  — ${user.note}`);
  }
}

if (require.main === module) {
  runSeedCli(seedUsers).catch(reportSeedFailure);
}
