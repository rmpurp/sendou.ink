import type { LfgGroupType } from "@prisma/client";
import { db } from "~/utils/db.server";

export function create({
  type,
  ranked,
  user,
}: {
  type: LfgGroupType;
  ranked?: boolean;
  user: { id: string };
}) {
  return db.lfgGroup.create({
    data: {
      type,
      // TWIN starts looking immediately because it makes no sense
      // to pre-add players to the group
      looking: type === "TWIN",
      ranked,
      members: {
        create: {
          memberId: user.id,
          captain: true,
        },
      },
    },
  });
}

export function findActiveByMember(user: { id: string }) {
  return db.lfgGroup.findFirst({
    where: {
      active: true,
      members: {
        some: {
          memberId: user.id,
        },
      },
    },
    include: {
      members: true,
    },
  });
}

export function findLookingByType(type: LfgGroupType, ranked: boolean | null) {
  return db.lfgGroup.findMany({
    where: {
      type,
      looking: true,
      // For ranked groups we show both ranked and unranked options
      ranked: ranked === false ? false : undefined,
    },
    select: {
      id: true,
      ranked: true,
      members: {
        select: {
          user: {
            select: {
              discordAvatar: true,
              discordDiscriminator: true,
              discordName: true,
              discordId: true,
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export function startLooking(id: string) {
  return db.lfgGroup.update({
    where: {
      id,
    },
    data: {
      looking: true,
    },
  });
}