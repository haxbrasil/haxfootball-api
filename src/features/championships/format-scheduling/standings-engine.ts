export type StandingsCriterion =
  | "points"
  | "wins"
  | "score-difference"
  | "score-for"
  | "score-against"
  | "head-to-head"
  | "head-to-head-points"
  | "head-to-head-score-difference"
  | "manual";

export type StandingsRule = {
  criterion: StandingsCriterion;
  direction: "asc" | "desc";
  config?: Record<string, unknown> | null;
};

export type StandingsTeam = {
  id: number;
  uuid: string;
  name: string;
  displayOrder: number;
};

export type StandingsMatch = {
  uuid: string;
  sideATeamId: number;
  sideBTeamId: number;
  sideAOfficialScore: number;
  sideBOfficialScore: number;
  sideAOutcome: "win" | "loss" | "draw";
  sideBOutcome: "win" | "loss" | "draw";
};

export type StandingsScoring = {
  win: number;
  draw: number;
  loss: number;
};

export type StandingsRecord = {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  scoreFor: number;
  scoreAgainst: number;
  scoreDifference: number;
};

export type StandingsRow = StandingsRecord & {
  rank: number;
  team: StandingsTeam;
  unresolvedTie: boolean;
  tieGroup: string | null;
  criteria: Array<{
    criterion: StandingsCriterion;
    value: number;
    scope: "overall" | "head-to-head" | "manual";
  }>;
};

export type StandingsResult = {
  rows: StandingsRow[];
  unresolvedTies: Array<{
    key: string;
    rankFrom: number;
    rankTo: number;
    teamUuids: string[];
  }>;
};

type RankedCohort = {
  teams: StandingsTeam[];
  unresolved: boolean;
};

export function calculateStandings(input: {
  teams: StandingsTeam[];
  matches: StandingsMatch[];
  rules: StandingsRule[];
  scoring: StandingsScoring;
  headToHeadRestart: "continue" | "restart-for-subgroup";
}): StandingsResult {
  const teams = deduplicateTeams(input.teams);
  const teamIds = new Set(teams.map((team) => team.id));
  const matches = input.matches.filter(
    (match) => teamIds.has(match.sideATeamId) || teamIds.has(match.sideBTeamId)
  );
  const overall = aggregateRecords(teams, matches, input.scoring);
  const criteria: StandingsRule[] =
    input.rules.length > 0
      ? input.rules
      : [{ criterion: "points", direction: "desc" }];
  const firstHeadToHeadIndex = criteria.findIndex((rule) =>
    isHeadToHead(rule.criterion)
  );
  const criterionTrace = new Map<number, Map<number, number>>();
  const ranked = refineCohort({
    teams,
    criterionIndex: 0,
    criteria,
    matches,
    scoring: input.scoring,
    overall,
    headToHeadRestart: input.headToHeadRestart,
    firstHeadToHeadIndex,
    restartBudget: criteria.length * Math.max(1, teams.length),
    criterionTrace
  });
  const rows: StandingsRow[] = [];
  const unresolvedTies: StandingsResult["unresolvedTies"] = [];
  let position = 1;

  for (const cohort of ranked) {
    const sorted = [...cohort.teams].sort(compareStableTeam);
    const tieKey =
      cohort.unresolved && sorted.length > 1
        ? `tie-${position}-${sorted.map((team) => team.uuid).join("-")}`
        : null;
    if (tieKey) {
      unresolvedTies.push({
        key: tieKey,
        rankFrom: position,
        rankTo: position + sorted.length - 1,
        teamUuids: sorted.map((team) => team.uuid)
      });
    }

    for (const team of sorted) {
      const record = overall.get(team.id) ?? emptyRecord();
      rows.push({
        rank: position,
        team,
        ...record,
        unresolvedTie: tieKey !== null,
        tieGroup: tieKey,
        criteria: criteria.map((rule, criterionIndex) => ({
          criterion: rule.criterion,
          value:
            criterionTrace.get(team.id)?.get(criterionIndex) ??
            criterionValue(rule, team, teams, matches, input.scoring, overall),
          scope: isHeadToHead(rule.criterion)
            ? "head-to-head"
            : rule.criterion === "manual"
              ? "manual"
              : "overall"
        }))
      });
    }
    position += sorted.length;
  }

  return { rows, unresolvedTies };
}

function refineCohort(input: {
  teams: StandingsTeam[];
  criterionIndex: number;
  criteria: StandingsRule[];
  matches: StandingsMatch[];
  scoring: StandingsScoring;
  overall: Map<number, StandingsRecord>;
  headToHeadRestart: "continue" | "restart-for-subgroup";
  firstHeadToHeadIndex: number;
  restartBudget: number;
  criterionTrace: Map<number, Map<number, number>>;
}): RankedCohort[] {
  if (input.teams.length <= 1) {
    return [{ teams: input.teams, unresolved: false }];
  }
  if (input.criterionIndex >= input.criteria.length) {
    return [{ teams: input.teams, unresolved: true }];
  }

  const rule = input.criteria[input.criterionIndex]!;
  const values = new Map(
    input.teams.map((team) => [
      team.id,
      criterionValue(
        rule,
        team,
        input.teams,
        input.matches,
        input.scoring,
        input.overall
      )
    ])
  );
  for (const team of input.teams) {
    const trace =
      input.criterionTrace.get(team.id) ?? new Map<number, number>();
    trace.set(input.criterionIndex, values.get(team.id)!);
    input.criterionTrace.set(team.id, trace);
  }
  const ordered = [...input.teams].sort((left, right) => {
    const difference = values.get(left.id)! - values.get(right.id)!;
    if (difference !== 0) {
      return rule.direction === "desc" ? -difference : difference;
    }
    return compareStableTeam(left, right);
  });
  const partitions: StandingsTeam[][] = [];

  for (const team of ordered) {
    const current = partitions.at(-1);
    if (!current || values.get(current[0]!.id) !== values.get(team.id)) {
      partitions.push([team]);
    } else {
      current.push(team);
    }
  }

  return partitions.flatMap((partition) => {
    if (partition.length === 1) {
      return [{ teams: partition, unresolved: false }];
    }
    const splitOccurred = partitions.length > 1;
    const shouldRestart =
      splitOccurred &&
      isHeadToHead(rule.criterion) &&
      input.headToHeadRestart === "restart-for-subgroup" &&
      input.firstHeadToHeadIndex >= 0 &&
      input.restartBudget > 0;

    return refineCohort({
      ...input,
      teams: partition,
      criterionIndex: shouldRestart
        ? input.firstHeadToHeadIndex
        : input.criterionIndex + 1,
      restartBudget: input.restartBudget - (shouldRestart ? 1 : 0)
    });
  });
}

function criterionValue(
  rule: StandingsRule,
  team: StandingsTeam,
  cohort: StandingsTeam[],
  matches: StandingsMatch[],
  scoring: StandingsScoring,
  overall: Map<number, StandingsRecord>
): number {
  if (rule.criterion === "manual") {
    const order = Array.isArray(rule.config?.teamOrder)
      ? rule.config.teamOrder.filter(
          (value): value is string => typeof value === "string"
        )
      : [];
    const index = order.indexOf(team.uuid);
    return index < 0 ? Number.MAX_SAFE_INTEGER : index;
  }

  const record = isHeadToHead(rule.criterion)
    ? (aggregateRecords(
        cohort,
        matches.filter(
          (match) =>
            cohort.some((candidate) => candidate.id === match.sideATeamId) &&
            cohort.some((candidate) => candidate.id === match.sideBTeamId)
        ),
        scoring
      ).get(team.id) ?? emptyRecord())
    : (overall.get(team.id) ?? emptyRecord());

  switch (rule.criterion) {
    case "points":
    case "head-to-head":
    case "head-to-head-points":
      return record.points;
    case "wins":
      return record.wins;
    case "score-difference":
    case "head-to-head-score-difference":
      return record.scoreDifference;
    case "score-for":
      return record.scoreFor;
    case "score-against":
      return record.scoreAgainst;
  }
}

function aggregateRecords(
  teams: StandingsTeam[],
  matches: StandingsMatch[],
  scoring: StandingsScoring
) {
  const records = new Map(teams.map((team) => [team.id, emptyRecord()]));
  for (const match of matches) {
    addMatch(
      records.get(match.sideATeamId),
      match.sideAOfficialScore,
      match.sideBOfficialScore,
      match.sideAOutcome,
      scoring
    );
    addMatch(
      records.get(match.sideBTeamId),
      match.sideBOfficialScore,
      match.sideAOfficialScore,
      match.sideBOutcome,
      scoring
    );
  }
  return records;
}

function addMatch(
  record: StandingsRecord | undefined,
  scoreFor: number,
  scoreAgainst: number,
  outcome: "win" | "loss" | "draw",
  scoring: StandingsScoring
) {
  if (!record) return;
  record.played += 1;
  record.scoreFor += scoreFor;
  record.scoreAgainst += scoreAgainst;
  record.scoreDifference = record.scoreFor - record.scoreAgainst;
  if (outcome === "win") {
    record.wins += 1;
    record.points += scoring.win;
  } else if (outcome === "draw") {
    record.draws += 1;
    record.points += scoring.draw;
  } else {
    record.losses += 1;
    record.points += scoring.loss;
  }
}

function emptyRecord(): StandingsRecord {
  return {
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    points: 0,
    scoreFor: 0,
    scoreAgainst: 0,
    scoreDifference: 0
  };
}

function isHeadToHead(criterion: StandingsCriterion) {
  return (
    criterion === "head-to-head" ||
    criterion === "head-to-head-points" ||
    criterion === "head-to-head-score-difference"
  );
}

function deduplicateTeams(teams: StandingsTeam[]) {
  return [
    ...new Map(
      [...teams].sort(compareStableTeam).map((team) => [team.id, team])
    ).values()
  ];
}

function compareStableTeam(left: StandingsTeam, right: StandingsTeam) {
  return (
    left.displayOrder - right.displayOrder ||
    left.name.localeCompare(right.name) ||
    left.id - right.id
  );
}
