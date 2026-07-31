export type RoundRobinTeam = {
  id: number;
  uuid: string;
  name: string;
  groupUuid: string;
};

export type RoundRobinExistingMatch = {
  sideATeamId: number;
  sideBTeamId: number;
};

export type RoundRobinPairOverride = {
  groupAUuid: string;
  groupBUuid: string;
  meetings: number;
};

export type RoundRobinPairing = {
  key: string;
  sideATeamId: number;
  sideBTeamId: number;
  groupUuid: string | null;
  meeting: number;
  existing: boolean;
  competitionRoundUuid: string | null;
};

export type RoundRobinPlan = {
  pairings: RoundRobinPairing[];
  desiredMatchCount: number;
  existingMatchCount: number;
  missingMatchCount: number;
  excessMatchCount: number;
  matchCountsByTeam: Array<{
    teamId: number;
    desired: number;
    existing: number;
    missing: number;
  }>;
};

export function generateRoundRobinPlan(input: {
  teams: RoundRobinTeam[];
  existingMatches: RoundRobinExistingMatch[];
  sameGroupMeetings: number;
  crossGroupMeetings: number;
  pairOverrides: RoundRobinPairOverride[];
  competitionRoundUuids: string[];
}): RoundRobinPlan {
  const teams = [
    ...new Map(input.teams.map((team) => [team.id, team])).values()
  ].sort((left, right) => left.id - right.id);
  const existingByPair = countPairs(input.existingMatches);
  const desiredByTeam = new Map(teams.map((team) => [team.id, 0]));
  const existingByTeam = new Map(teams.map((team) => [team.id, 0]));
  const pairings: RoundRobinPairing[] = [];
  let excessMatchCount = 0;

  for (let leftIndex = 0; leftIndex < teams.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < teams.length;
      rightIndex += 1
    ) {
      const left = teams[leftIndex]!;
      const right = teams[rightIndex]!;
      const key = pairKey(left.id, right.id);
      const existingCount = existingByPair.get(key) ?? 0;
      const meetings = meetingsForPair(input, left, right);
      const sameGroup = left.groupUuid === right.groupUuid;

      desiredByTeam.set(left.id, (desiredByTeam.get(left.id) ?? 0) + meetings);
      desiredByTeam.set(
        right.id,
        (desiredByTeam.get(right.id) ?? 0) + meetings
      );
      existingByTeam.set(
        left.id,
        (existingByTeam.get(left.id) ?? 0) + existingCount
      );
      existingByTeam.set(
        right.id,
        (existingByTeam.get(right.id) ?? 0) + existingCount
      );
      excessMatchCount += Math.max(0, existingCount - meetings);

      for (let meeting = 1; meeting <= meetings; meeting += 1) {
        const swapSides = (meeting + leftIndex + rightIndex) % 2 === 0;
        const sequence = pairings.length;
        pairings.push({
          key: `${left.uuid}:${right.uuid}:${meeting}`,
          sideATeamId: swapSides ? right.id : left.id,
          sideBTeamId: swapSides ? left.id : right.id,
          groupUuid: sameGroup ? left.groupUuid : null,
          meeting,
          existing: meeting <= existingCount,
          competitionRoundUuid:
            input.competitionRoundUuids.length > 0
              ? input.competitionRoundUuids[
                  sequence % input.competitionRoundUuids.length
                ]!
              : null
        });
      }
    }
  }

  const desiredMatchCount = pairings.length;
  const existingMatchCount = input.existingMatches.length;
  const missingMatchCount = pairings.filter(
    (pairing) => !pairing.existing
  ).length;

  return {
    pairings,
    desiredMatchCount,
    existingMatchCount,
    missingMatchCount,
    excessMatchCount,
    matchCountsByTeam: teams.map((team) => {
      const desired = desiredByTeam.get(team.id) ?? 0;
      const existing = existingByTeam.get(team.id) ?? 0;

      return {
        teamId: team.id,
        desired,
        existing,
        missing: Math.max(0, desired - existing)
      };
    })
  };
}

function meetingsForPair(
  input: {
    sameGroupMeetings: number;
    crossGroupMeetings: number;
    pairOverrides: RoundRobinPairOverride[];
  },
  left: RoundRobinTeam,
  right: RoundRobinTeam
) {
  const override = input.pairOverrides.find(
    (candidate) =>
      groupPairKey(candidate.groupAUuid, candidate.groupBUuid) ===
      groupPairKey(left.groupUuid, right.groupUuid)
  );

  return (
    override?.meetings ??
    (left.groupUuid === right.groupUuid
      ? input.sameGroupMeetings
      : input.crossGroupMeetings)
  );
}

function countPairs(matches: RoundRobinExistingMatch[]) {
  const counts = new Map<string, number>();

  for (const match of matches) {
    const key = pairKey(match.sideATeamId, match.sideBTeamId);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return counts;
}

function pairKey(left: number, right: number) {
  return left < right ? `${left}:${right}` : `${right}:${left}`;
}

function groupPairKey(left: string, right: string) {
  return left < right ? `${left}:${right}` : `${right}:${left}`;
}
