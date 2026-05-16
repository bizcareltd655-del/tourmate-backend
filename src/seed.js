import 'dotenv/config';
import { query, initDb, pool } from './db.js';
import { hashPassword } from './auth.js';

const users = [
  { id: 'u1', name: 'অ্যাডমিন',        email: 'admin@tourmate.com',   password: 'admin123',   role: 'admin' },
  { id: 'u2', name: 'রহিম ম্যানেজার',  email: 'manager@tourmate.com', password: 'manager123', role: 'manager' },
  { id: 'u3', name: 'করিম মেম্বার',    email: 'member@tourmate.com',  password: 'member123',  role: 'member' },
  { id: 'u4', name: 'সালমা আক্তার',    email: 'salma@tourmate.com',   password: 'demo123',    role: 'member' },
  { id: 'u5', name: 'জুনায়েদ হাসান',   email: 'junayed@tourmate.com', password: 'demo123',    role: 'member' },
];

const tours = [
  { id: 't1', name: 'ককসবাজার ট্যুর', destination: 'ককসবাজার', start_date: '2026-06-10', end_date: '2026-06-13', budget: 50000, status: 'planning', cover: '🏖️', created_by: 'u2', members: ['u2','u3','u4','u5'] },
  { id: 't2', name: 'সাজেক ভ্যালি',     destination: 'সাজেক, রাঙামাটি', start_date: '2026-07-05', end_date: '2026-07-08', budget: 35000, status: 'planning', cover: '🏔️', created_by: 'u2', members: ['u2','u3','u4'] },
  { id: 't3', name: 'সুন্দরবন এক্সপ্লোর', destination: 'সুন্দরবন', start_date: '2026-03-15', end_date: '2026-03-18', budget: 45000, status: 'completed', cover: '🌳', created_by: 'u2', members: ['u2','u4','u5'] },
];

const expenses = [
  { id: 'e1', tour_id: 't1', title: 'হোটেল বুকিং',       category: 'accommodation', amount: 18000, paid_by: 'u2', date: '2026-06-10', note: 'সি ভিউ রুম', split_between: ['u2','u3','u4','u5'] },
  { id: 'e2', tour_id: 't1', title: 'বাস টিকিট',          category: 'transport',     amount:  8000, paid_by: 'u3', date: '2026-06-10', note: 'নন এসি',     split_between: ['u2','u3','u4','u5'] },
  { id: 'e3', tour_id: 't1', title: 'খাবার - প্রথম দিন',  category: 'food',          amount:  4500, paid_by: 'u4', date: '2026-06-11', note: '',           split_between: ['u2','u3','u4','u5'] },
  { id: 'e4', tour_id: 't1', title: 'বিচ অ্যাক্টিভিটি',   category: 'activity',      amount:  3500, paid_by: 'u2', date: '2026-06-11', note: 'প্যারাসেইলিং', split_between: ['u2','u3','u4','u5'] },
  { id: 'e5', tour_id: 't3', title: 'বোট ভাড়া',           category: 'transport',     amount: 12000, paid_by: 'u2', date: '2026-03-15', note: '',           split_between: ['u2','u4','u5'] },
];

const tasks = [
  { id: 'k1', tour_id: 't1', title: 'হোটেল কনফার্ম করা',    assigned_to: 'u2', status: 'done',        priority: 'high',   due_date: '2026-05-30' },
  { id: 'k2', tour_id: 't1', title: 'বাস টিকিট কেনা',       assigned_to: 'u3', status: 'done',        priority: 'high',   due_date: '2026-05-25' },
  { id: 'k3', tour_id: 't1', title: 'ফাস্ট এইড কিট প্যাক',  assigned_to: 'u4', status: 'in_progress', priority: 'medium', due_date: '2026-06-08' },
  { id: 'k4', tour_id: 't1', title: 'গ্রুপ ফটো প্ল্যান',     assigned_to: 'u5', status: 'todo',        priority: 'low',    due_date: '2026-06-12' },
  { id: 'k5', tour_id: 't2', title: 'গাড়ি ভাড়া ঠিক করা',    assigned_to: 'u2', status: 'in_progress', priority: 'high',   due_date: '2026-06-25' },
];

const itin = [
  { id: 'i1', tour_id: 't1', title: 'ঢাকা থেকে বাস ছাড়বে', date: '2026-06-10', time: '06:00', location: 'গাবতলী',          note: '৫:৩০ এ পৌঁছাতে হবে' },
  { id: 'i2', tour_id: 't1', title: 'হোটেল চেক ইন',        date: '2026-06-10', time: '14:00', location: 'হোটেল সি প্যালেস', note: '' },
  { id: 'i3', tour_id: 't1', title: 'বিচে সূর্যাস্ত',        date: '2026-06-10', time: '17:00', location: 'লাবনী পয়েন্ট',     note: 'ক্যামেরা সাথে রাখবে' },
  { id: 'i4', tour_id: 't1', title: 'হিমছড়ি ভিজিট',         date: '2026-06-11', time: '08:00', location: 'হিমছড়ি',          note: '' },
  { id: 'i5', tour_id: 't1', title: 'প্যারাসেইলিং',          date: '2026-06-11', time: '15:00', location: 'বিচ',              note: 'অ্যাডভান্স বুকিং করা আছে' },
];

async function run() {
  await initDb();
  console.log('🌱 Seeding...');
  await query('TRUNCATE itinerary, tasks, expenses, tour_members, tours, users CASCADE');

  for (const u of users) {
    const hashed = await hashPassword(u.password);
    await query(
      'INSERT INTO users (id, name, email, password, role) VALUES ($1,$2,$3,$4,$5)',
      [u.id, u.name, u.email, hashed, u.role]
    );
  }
  for (const t of tours) {
    await query(
      `INSERT INTO tours (id, name, destination, start_date, end_date, budget, status, cover, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [t.id, t.name, t.destination, t.start_date, t.end_date, t.budget, t.status, t.cover, t.created_by]
    );
    for (const m of t.members) {
      await query('INSERT INTO tour_members (tour_id, user_id) VALUES ($1,$2)', [t.id, m]);
    }
  }
  for (const e of expenses) {
    await query(
      `INSERT INTO expenses (id, tour_id, title, category, amount, paid_by, date, note, split_between)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [e.id, e.tour_id, e.title, e.category, e.amount, e.paid_by, e.date, e.note, e.split_between]
    );
  }
  for (const k of tasks) {
    await query(
      `INSERT INTO tasks (id, tour_id, title, assigned_to, status, priority, due_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [k.id, k.tour_id, k.title, k.assigned_to, k.status, k.priority, k.due_date]
    );
  }
  for (const i of itin) {
    await query(
      `INSERT INTO itinerary (id, tour_id, title, date, time, location, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [i.id, i.tour_id, i.title, i.date, i.time, i.location, i.note]
    );
  }
  console.log('✅ Seeded!');
  console.log('Login credentials:');
  console.log('  admin@tourmate.com / admin123');
  console.log('  manager@tourmate.com / manager123');
  console.log('  member@tourmate.com / member123');
  await pool.end();
}

run().catch(err => { console.error(err); process.exit(1); });
