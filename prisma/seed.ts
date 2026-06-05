import { PrismaClient, PlanName } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  const plans = await Promise.all([
    prisma.subscriptionPlan.upsert({
      where: { name: PlanName.STARTER },
      update: {},
      create: { name: PlanName.STARTER, managerLimit: 1, technicianLimit: 5, ticketLimit: 200, storageLimitGb: 5, price: 999 },
    }),
    prisma.subscriptionPlan.upsert({
      where: { name: PlanName.PROFESSIONAL },
      update: {},
      create: { name: PlanName.PROFESSIONAL, managerLimit: 5, technicianLimit: 25, ticketLimit: 1000, storageLimitGb: 25, price: 2999 },
    }),
    prisma.subscriptionPlan.upsert({
      where: { name: PlanName.ENTERPRISE },
      update: {},
      create: { name: PlanName.ENTERPRISE, managerLimit: 9999, technicianLimit: 9999, ticketLimit: 99999, storageLimitGb: 999, price: 9999 },
    }),
  ]);

  console.log(`Created ${plans.length} subscription plans`);
  console.log('\nSeeding complete!');
  console.log('→ Create your super admin at: POST /api/v1/web/super-admin/setup');
}

main()
  .catch((e) => { console.error(e); throw e; })
  .finally(async () => { await prisma.$disconnect(); });
