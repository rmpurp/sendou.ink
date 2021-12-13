import { Prisma } from ".prisma/client";
import {
  TOURNAMENT_CHECK_IN_CLOSING_MINUTES_FROM_START,
  TOURNAMENT_TEAM_ROSTER_MAX_SIZE,
} from "~/constants";
import { isTournamentAdmin } from "~/core/tournament/permissions";
import { sortTeamsBySeed } from "~/core/tournament/utils";
import { Serialized, Unpacked } from "~/utils";
import { db } from "~/utils/db.server";
import {
  PrismaTournamentsByNameForUrl,
  tournamentsByNameForUrl,
} from "./tournament.prisma";

export type FindTournamentByNameForUrlI = Serialized<
  Prisma.PromiseReturnType<typeof findTournamentByNameForUrl>
>;

export async function findTournamentByNameForUrl({
  organizationNameForUrl,
  tournamentNameForUrl,
}: {
  organizationNameForUrl: string;
  tournamentNameForUrl: string;
}) {
  const tournaments = await tournamentsByNameForUrl(tournamentNameForUrl);

  const result = tournaments.find(
    (tournament) =>
      tournament.organizer.nameForUrl === organizationNameForUrl.toLowerCase()
  );

  if (!result) throw new Response("No tournament found", { status: 404 });

  result.teams.sort(sortTeamsBySeed(result.seeds));

  result.organizer.twitter = twitterToUrl(result.organizer.twitter);
  result.organizer.discordInvite = discordInviteToUrl(
    result.organizer.discordInvite
  );
  const resultWithCSSProperties = addCSSProperties(result);

  return resultWithCSSProperties;
}

function twitterToUrl(twitter: string | null) {
  if (!twitter) return twitter;

  return `https://twitter.com/${twitter}`;
}

function discordInviteToUrl(discordInvite: string) {
  return `https://discord.com/invite/${discordInvite}`;
}

function addCSSProperties(tournament: Unpacked<PrismaTournamentsByNameForUrl>) {
  const { bannerTextHSLArgs, ...rest } = tournament;

  return {
    ...rest,
    CSSProperties: {
      text: `hsl(${bannerTextHSLArgs})`,
      textTransparent: `hsla(${bannerTextHSLArgs}, 0.3)`,
    },
  };
}

export type OwnTeamWithInviteCodeI = Serialized<
  Prisma.PromiseReturnType<typeof ownTeamWithInviteCode>
>;

export async function ownTeamWithInviteCode({
  organizationNameForUrl,
  tournamentNameForUrl,
  userId,
}: {
  organizationNameForUrl: string;
  tournamentNameForUrl: string;
  userId?: string;
}) {
  const tournaments = await db.tournament.findMany({
    where: {
      nameForUrl: tournamentNameForUrl.toLowerCase(),
    },
    select: {
      organizer: {
        select: {
          nameForUrl: true,
        },
      },
      teams: {
        select: {
          id: true,
          name: true,
          inviteCode: true,
          checkedInTime: true,
          members: {
            select: {
              captain: true,
              member: {
                select: {
                  id: true,
                  discordAvatar: true,
                  discordName: true,
                  discordId: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const tournament = tournaments.find(
    (tournament) =>
      tournament.organizer.nameForUrl === organizationNameForUrl.toLowerCase()
  );

  if (!tournament) throw new Response("No tournament found", { status: 404 });

  const ownTeam = tournament.teams.find((team) =>
    team.members.some(({ captain, member }) => captain && member.id === userId)
  );

  if (!ownTeam) throw new Response("No own team found", { status: 404 });

  return ownTeam;
}

export async function findTournamentWithInviteCodes({
  organizationNameForUrl,
  tournamentNameForUrl,
}: {
  organizationNameForUrl: string;
  tournamentNameForUrl: string;
}) {
  const tournaments = await db.tournament.findMany({
    where: {
      nameForUrl: tournamentNameForUrl.toLowerCase(),
    },
    select: {
      startTime: true,
      organizer: {
        select: {
          nameForUrl: true,
        },
      },
      mapPool: {
        select: {
          mode: true,
          name: true,
        },
      },
      teams: {
        select: {
          name: true,
          inviteCode: true,
          members: {
            select: {
              captain: true,
              member: {
                select: {
                  discordName: true,
                  id: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const result = tournaments.find(
    (tournament) =>
      tournament.organizer.nameForUrl === organizationNameForUrl.toLowerCase()
  );

  if (!result) throw new Response("No tournament found", { status: 404 });

  return result;
}

export function createTournamentTeam({
  userId,
  teamName,
  tournamentId,
}: {
  userId: string;
  teamName: string;
  tournamentId: string;
}) {
  return db.tournamentTeam.create({
    data: {
      name: teamName.trim(),
      tournamentId,
      members: {
        create: {
          memberId: userId,
          tournamentId,
          captain: true,
        },
      },
    },
  });
}

export async function joinTeamViaInviteCode({
  tournamentId,
  inviteCode,
  userId,
}: {
  tournamentId: string;
  inviteCode: string;
  userId: string;
}) {
  const tournament = await db.tournament.findUnique({
    where: { id: tournamentId },
    include: { teams: { include: { members: true } } },
  });

  if (!tournament) throw new Response("Invalid tournament id", { status: 400 });

  // TODO: 400 if tournament already started / concluded (depending on if tournament allows mid-event roster additions)

  const tournamentTeamToJoin = tournament.teams.find(
    (team) => team.inviteCode === inviteCode
  );
  if (!tournamentTeamToJoin)
    throw new Response("Invalid invite code", { status: 400 });
  if (tournamentTeamToJoin.members.length >= TOURNAMENT_TEAM_ROSTER_MAX_SIZE) {
    throw new Response("Team is already full", { status: 400 });
  }

  const trustReceiverId = tournamentTeamToJoin.members.find(
    ({ captain }) => captain
  )!.memberId;

  return Promise.all([
    db.tournamentTeamMember.create({
      data: {
        tournamentId,
        teamId: tournamentTeamToJoin.id,
        memberId: userId,
      },
    }),
    // TODO: this could also be put to queue and scheduled for later
    db.trustRelationships.upsert({
      where: {
        trustGiverId_trustReceiverId: {
          trustGiverId: userId,
          trustReceiverId,
        },
      },
      create: {
        trustGiverId: userId,
        trustReceiverId,
      },
      update: {},
    }),
  ]);
}

export async function putPlayerToTeam({
  teamId,
  captainId,
  newPlayerId,
}: {
  teamId: string;
  captainId: string;
  newPlayerId: string;
}) {
  const tournamentTeam = await db.tournamentTeam.findUnique({
    where: { id: teamId },
    include: { tournament: true, members: true },
  });

  if (!tournamentTeam) throw new Response("Invalid team id", { status: 400 });

  // TODO: 400 if tournament already started / concluded (depending on if tournament allows mid-event roster additions)

  if (tournamentTeam.members.length >= TOURNAMENT_TEAM_ROSTER_MAX_SIZE) {
    throw new Response("Team is already full", { status: 400 });
  }

  if (
    !tournamentTeam.members.some(
      ({ memberId, captain }) => captain && memberId === captainId
    )
  ) {
    throw new Response("Not captain of the team", { status: 401 });
  }

  return db.tournamentTeamMember.create({
    data: {
      tournamentId: tournamentTeam.tournament.id,
      teamId,
      memberId: newPlayerId,
    },
  });
}

export async function removePlayerFromTeam({
  teamId,
  captainId,
  playerId,
}: {
  teamId: string;
  captainId: string;
  playerId: string;
}) {
  if (captainId === playerId) {
    throw new Response("Can't remove captain", { status: 400 });
  }

  const tournamentTeam = await db.tournamentTeam.findUnique({
    where: { id: teamId },
    include: { tournament: true, members: true },
  });

  if (!tournamentTeam) throw new Response("Invalid team id", { status: 400 });
  if (tournamentTeam.checkedInTime) {
    throw new Response("Can't remove players after checking in", {
      status: 400,
    });
  }
  if (
    !tournamentTeam.members.some(
      ({ memberId, captain }) => captain && memberId === captainId
    )
  ) {
    throw new Response("Not captain of the team", { status: 401 });
  }

  return db.tournamentTeamMember.delete({
    where: {
      memberId_tournamentId: {
        memberId: playerId,
        tournamentId: tournamentTeam.tournament.id,
      },
    },
  });
}

export async function checkIn({
  teamId,
  userId,
}: {
  teamId: string;
  userId: string;
}) {
  const tournamentTeam = await db.tournamentTeam.findUnique({
    where: { id: teamId },
    include: { tournament: { include: { organizer: true } }, members: true },
  });

  if (!tournamentTeam) throw new Response("Invalid team id", { status: 400 });

  if (
    !isTournamentAdmin({
      userId,
      organization: tournamentTeam.tournament.organizer,
    }) &&
    !tournamentTeam.members.some(
      ({ memberId, captain }) => captain && memberId === userId
    )
  ) {
    throw new Response("Not captain of the team", { status: 401 });
  }
  // cut them some slack so UI never shows you can check in when you can't
  const checkInCutOff = TOURNAMENT_CHECK_IN_CLOSING_MINUTES_FROM_START - 2;
  if (
    !isTournamentAdmin({
      userId,
      organization: tournamentTeam.tournament.organizer,
    }) &&
    tournamentTeam.tournament.startTime.getTime() - checkInCutOff * 60000 <
      new Date().getTime()
  ) {
    throw new Response("Check in time has passed", { status: 400 });
  }

  // TODO: fail if tournament has started

  return db.tournamentTeam.update({
    where: {
      id: teamId,
    },
    data: {
      checkedInTime: new Date(),
    },
  });
}

export async function checkOut({
  teamId,
  userId,
}: {
  teamId: string;
  userId: string;
}) {
  const tournamentTeam = await db.tournamentTeam.findUnique({
    where: { id: teamId },
    include: { tournament: { include: { organizer: true } }, members: true },
  });
  if (!tournamentTeam) throw new Response("Invalid team id", { status: 400 });
  if (
    !isTournamentAdmin({
      organization: tournamentTeam.tournament.organizer,
      userId,
    })
  ) {
    throw new Response("Not tournament admin", { status: 401 });
  }

  // TODO: fail if tournament has started

  return db.tournamentTeam.update({
    where: {
      id: teamId,
    },
    data: {
      checkedInTime: null,
    },
  });
}

export async function updateSeeds({
  tournamentId,
  userId,
  newSeeds,
}: {
  tournamentId: string;
  userId: string;
  newSeeds: string[];
}) {
  const tournament = await db.tournament.findUnique({
    where: { id: tournamentId },
    include: { organizer: true },
  });
  if (!tournament) throw new Response("Invalid tournament id", { status: 400 });
  if (
    !isTournamentAdmin({
      organization: tournament.organizer,
      userId,
    })
  ) {
    throw new Response("Not tournament admin", { status: 401 });
  }

  // TODO: fail if tournament has started

  return db.tournament.update({
    where: {
      id: tournamentId,
    },
    data: {
      seeds: newSeeds,
    },
  });
}