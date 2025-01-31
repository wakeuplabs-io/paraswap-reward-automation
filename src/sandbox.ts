import { PrismaClient } from '@prisma/client';

(async () => {
  const prisma = new PrismaClient();

  console.log(
    await prisma.event.count({ where: { sePSP1AmountEth: { not: '0' } } })
  );
})();
