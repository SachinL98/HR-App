import type { Tx } from '../prisma/prisma.service';

/** Writes in-app notifications. Email, push, Discord and WhatsApp channels plug in here later. */
export async function notify(
  tx: Tx,
  tenantId: string,
  memberIds: string[],
  n: { event: string; title: string; body?: string; link?: string },
) {
  const ids = [...new Set(memberIds)];
  if (!ids.length) return;
  await tx.notification.createMany({
    data: ids.map((memberId) => ({
      tenantId,
      memberId,
      event: n.event,
      title: n.title,
      body: n.body,
      link: n.link,
      channels: ['in_app'],
    })),
  });
}
