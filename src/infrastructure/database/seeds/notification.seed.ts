import dataSource from '../data-source';

interface SeedNotification {
  email: string;
  eventId: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, string>;
  age: string;
  read: boolean;
}

const NOTIFICATIONS: SeedNotification[] = [
  {
    email: 'nour@example.com',
    eventId: 'a1111111-1111-4111-8111-111111111111',
    type: 'BOOKING_CONFIRMED',
    title: 'Booking Confirmed',
    body: 'Your appointment with Dr. Sara at Nile Clinic on Sun 11 Oct at 10:00 AM is confirmed.',
    data: { appointmentId: 'seed-appointment-1' },
    age: '0 seconds',
    read: false,
  },
  {
    email: 'nour@example.com',
    eventId: 'a2222222-2222-4222-8222-222222222222',
    type: 'DOCTOR_FAVORITED',
    title: 'Doctor Added to Favorites',
    body: 'Dr. Sara has been added to your favorites.',
    data: { doctorId: 'seed-doctor-1' },
    age: '1 second',
    read: false,
  },
  {
    email: 'nour@example.com',
    eventId: 'a3333333-3333-4333-8333-333333333333',
    type: 'APPOINTMENT_REMINDER',
    title: 'Appointment Reminder',
    body: "Don't forget your appointment with Dr. Omar at Maadi Clinic on Thu 8 Oct at 4:00 PM.",
    data: { appointmentId: 'seed-appointment-2' },
    age: '2 days',
    read: false,
  },
  {
    email: 'nour@example.com',
    eventId: 'a4444444-4444-4444-8444-444444444444',
    type: 'APPOINTMENT_CANCELLED',
    title: 'Appointment Cancelled',
    body: 'Your appointment with Dr. Omar on Mon 28 Sep at 11:00 AM has been cancelled.',
    data: { appointmentId: 'seed-appointment-3' },
    age: '5 days',
    read: true,
  },
  {
    email: 'mona@example.com',
    eventId: 'b1111111-1111-4111-8111-111111111111',
    type: 'BOOKING_CONFIRMED',
    title: 'Booking Confirmed',
    body: "Mona's appointment with Dr. Sara is confirmed.",
    data: { appointmentId: 'seed-appointment-4' },
    age: '0 seconds',
    read: false,
  },
];

async function seed(): Promise<void> {
  await dataSource.initialize();

  let inserted = 0;
  for (const notification of NOTIFICATIONS) {
    const rows: unknown[] = await dataSource.query(
      `INSERT INTO notifications ("userId", "eventId", type, title, body, data, "readAt", "createdAt")
       SELECT u.id, $2, $3, $4, $5, $6::jsonb,
              CASE WHEN $8 THEN now() ELSE NULL END,
              now() - CAST($7 AS interval)
       FROM users u WHERE u.email = $1::varchar
       ON CONFLICT ("eventId", "userId") DO NOTHING
       RETURNING id`,
      [
        notification.email,
        notification.eventId,
        notification.type,
        notification.title,
        notification.body,
        JSON.stringify(notification.data),
        notification.age,
        notification.read,
      ],
    );
    inserted += rows.length;
  }

  await dataSource.destroy();

  console.log(`Notifications seeded: ${inserted} new`);
  console.log('  nour@example.com: 2 NEWEST unread, 1 OLD unread, 1 OLD read');
  console.log('  mona@example.com: 1 NEWEST unread');
  console.log('  run `npm run seed:users` first if the users do not exist');
}

seed().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
