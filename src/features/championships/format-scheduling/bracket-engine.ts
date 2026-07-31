export type SingleEliminationSpotPlan = {
  key: string;
  label: string;
  kind: "match-side" | "placement";
  displayOrder: number;
  placementRank?: number;
  teamIndex: number | null;
  x: number;
  y: number;
};

export type SingleEliminationMatchPlan = {
  key: string;
  label: string;
  displayOrder: number;
  round: number;
  position: number;
  sideASpotKey: string;
  sideBSpotKey: string;
  byeTeamIndex: number | null;
};

export type SingleEliminationRoutePlan = {
  sourceMatchKey: string;
  sourceOutcome: "winner" | "loser";
  destinationSpotKey: string;
};

export type SingleEliminationPlan = {
  bracketSize: number;
  roundCount: number;
  seedOrder: number[];
  spots: SingleEliminationSpotPlan[];
  matches: SingleEliminationMatchPlan[];
  routes: SingleEliminationRoutePlan[];
};

export type DoubleEliminationMatchPlan = {
  key: string;
  label: string;
  displayOrder: number;
  bracket: "winners" | "losers" | "grand-final";
  round: number;
  position: number;
  sideASpotKey: string;
  sideBSpotKey: string;
  autoBye: boolean;
  activation: {
    sourceMatchKey: string;
    condition: "if-side-a-wins" | "if-side-b-wins";
  } | null;
};

export type DoubleEliminationRoutePlan = {
  sourceMatchKey: string;
  sourceOutcome: "winner" | "loser";
  destinationSpotKey: string;
  condition: "always" | "if-side-a-wins" | "if-side-b-wins";
};

export type DoubleEliminationPlan = {
  bracketSize: number;
  winnersRoundCount: number;
  losersRoundCount: number;
  grandFinalReset: boolean;
  spots: SingleEliminationSpotPlan[];
  matches: DoubleEliminationMatchPlan[];
  routes: DoubleEliminationRoutePlan[];
};

type DoubleSlotSource = {
  matchKey: string;
  outcome: "winner" | "loser";
  condition?: DoubleEliminationRoutePlan["condition"];
};

type DoubleSlot = {
  possible: boolean;
  teamIndex: number | null;
  source: DoubleSlotSource | null;
};

export function nextPowerOfTwo(value: number): number {
  if (!Number.isInteger(value) || value < 2 || value > 64) {
    throw new Error("Single elimination requires between 2 and 64 teams");
  }

  let result = 2;

  while (result < value) {
    result *= 2;
  }

  return result;
}

export function standardSeedOrder(bracketSize: number): number[] {
  if (
    !Number.isInteger(bracketSize) ||
    bracketSize < 2 ||
    bracketSize > 64 ||
    (bracketSize & (bracketSize - 1)) !== 0
  ) {
    throw new Error("Bracket size must be a power of two between 2 and 64");
  }

  let order = [1, 2];

  while (order.length < bracketSize) {
    const sum = order.length * 2 + 1;
    order = order.flatMap((seed) => [seed, sum - seed]);
  }

  return order;
}

export function generateSingleEliminationPlan(
  teamCount: number
): SingleEliminationPlan {
  const bracketSize = nextPowerOfTwo(teamCount);
  const seedOrder = standardSeedOrder(bracketSize);
  const roundCount = Math.log2(bracketSize);
  const spots: SingleEliminationSpotPlan[] = [];
  const matches: SingleEliminationMatchPlan[] = [];
  const routes: SingleEliminationRoutePlan[] = [];
  const knownTeamBySpot = new Map<string, number>();
  let spotOrder = 0;
  let matchOrder = 0;

  for (let round = 1; round <= roundCount; round += 1) {
    const matchesInRound = bracketSize / 2 ** round;

    for (let position = 1; position <= matchesInRound; position += 1) {
      const matchKey = `r${round}-m${position}`;
      const sideASpotKey = `${matchKey}-a`;
      const sideBSpotKey = `${matchKey}-b`;
      const seedSlotA = (position - 1) * 2;
      const seedSlotB = seedSlotA + 1;
      const teamA =
        round === 1 && seedOrder[seedSlotA]! <= teamCount
          ? seedOrder[seedSlotA]! - 1
          : (knownTeamBySpot.get(sideASpotKey) ?? null);
      const teamB =
        round === 1 && seedOrder[seedSlotB]! <= teamCount
          ? seedOrder[seedSlotB]! - 1
          : (knownTeamBySpot.get(sideBSpotKey) ?? null);

      spots.push(
        {
          key: sideASpotKey,
          label: `${roundLabel(round, roundCount)} · lado A`,
          kind: "match-side",
          displayOrder: spotOrder++,
          teamIndex: teamA,
          x: round - 1,
          y: (position - 1) * 2
        },
        {
          key: sideBSpotKey,
          label: `${roundLabel(round, roundCount)} · lado B`,
          kind: "match-side",
          displayOrder: spotOrder++,
          teamIndex: teamB,
          x: round - 1,
          y: (position - 1) * 2 + 1
        }
      );

      const byeTeamIndex =
        round === 1 && (teamA === null) !== (teamB === null)
          ? (teamA ?? teamB)
          : null;

      matches.push({
        key: matchKey,
        label: `${roundLabel(round, roundCount)} ${position}`,
        displayOrder: matchOrder++,
        round,
        position,
        sideASpotKey,
        sideBSpotKey,
        byeTeamIndex
      });

      if (round < roundCount) {
        const nextPosition = Math.ceil(position / 2);
        const nextSide = position % 2 === 1 ? "a" : "b";
        const destinationSpotKey = `r${round + 1}-m${nextPosition}-${nextSide}`;

        routes.push({
          sourceMatchKey: matchKey,
          sourceOutcome: "winner",
          destinationSpotKey
        });
        if (byeTeamIndex !== null) {
          knownTeamBySpot.set(destinationSpotKey, byeTeamIndex);
        }
      } else {
        routes.push(
          {
            sourceMatchKey: matchKey,
            sourceOutcome: "winner",
            destinationSpotKey: "placement-champion"
          },
          {
            sourceMatchKey: matchKey,
            sourceOutcome: "loser",
            destinationSpotKey: "placement-runner-up"
          }
        );
      }
    }
  }

  spots.push(
    {
      key: "placement-champion",
      label: "Campeão",
      kind: "placement",
      displayOrder: spotOrder++,
      placementRank: 1,
      teamIndex: null,
      x: roundCount,
      y: 0
    },
    {
      key: "placement-runner-up",
      label: "Vice-campeão",
      kind: "placement",
      displayOrder: spotOrder,
      placementRank: 2,
      teamIndex: null,
      x: roundCount,
      y: 1
    }
  );

  return {
    bracketSize,
    roundCount,
    seedOrder,
    spots,
    matches,
    routes
  };
}

export function generateDoubleEliminationPlan(
  teamCount: number,
  grandFinalReset: boolean
): DoubleEliminationPlan {
  const bracketSize = nextPowerOfTwo(teamCount);
  const winnersRoundCount = Math.log2(bracketSize);
  const losersRoundCount = Math.max(0, 2 * (winnersRoundCount - 1));
  const seedOrder = standardSeedOrder(bracketSize);
  const spots: SingleEliminationSpotPlan[] = [];
  const matches: DoubleEliminationMatchPlan[] = [];
  const routes: DoubleEliminationRoutePlan[] = [];
  const losers = new Map<string, DoubleSlot>();
  let spotOrder = 0;
  let matchOrder = 0;

  const materializeMatch = (input: {
    key: string;
    label: string;
    bracket: DoubleEliminationMatchPlan["bracket"];
    round: number;
    position: number;
    sideA: DoubleSlot;
    sideB: DoubleSlot;
    x: number;
    y: number;
    activation?: DoubleEliminationMatchPlan["activation"];
  }) => {
    const sideASpotKey = `${input.key}-a`;
    const sideBSpotKey = `${input.key}-b`;
    const addSpot = (
      key: string,
      side: DoubleSlot,
      sideLabel: string,
      y: number
    ) => {
      spots.push({
        key,
        label: `${input.label} · ${sideLabel}`,
        kind: "match-side",
        displayOrder: spotOrder++,
        teamIndex: side.teamIndex,
        x: input.x,
        y
      });
      if (side.source) {
        routes.push({
          sourceMatchKey: side.source.matchKey,
          sourceOutcome: side.source.outcome,
          destinationSpotKey: key,
          condition: side.source.condition ?? "always"
        });
      }
    };
    addSpot(sideASpotKey, input.sideA, "lado A", input.y * 2);
    addSpot(sideBSpotKey, input.sideB, "lado B", input.y * 2 + 1);
    const autoBye = input.sideA.possible !== input.sideB.possible;
    matches.push({
      key: input.key,
      label: input.label,
      displayOrder: matchOrder++,
      bracket: input.bracket,
      round: input.round,
      position: input.position,
      sideASpotKey,
      sideBSpotKey,
      autoBye,
      activation: input.activation ?? null
    });
    const possibleSide = input.sideA.possible ? input.sideA : input.sideB;
    const winner: DoubleSlot = autoBye
      ? { ...possibleSide }
      : {
          possible: input.sideA.possible || input.sideB.possible,
          teamIndex: null,
          source: {
            matchKey: input.key,
            outcome: "winner"
          }
        };
    const loser: DoubleSlot = {
      possible: input.sideA.possible && input.sideB.possible,
      teamIndex: null,
      source:
        input.sideA.possible && input.sideB.possible
          ? { matchKey: input.key, outcome: "loser" }
          : null
    };
    losers.set(input.key, loser);
    return { winner, loser };
  };

  let previousWinners: DoubleSlot[] = [];
  for (let round = 1; round <= winnersRoundCount; round += 1) {
    const count = bracketSize / 2 ** round;
    const next: DoubleSlot[] = [];
    for (let position = 1; position <= count; position += 1) {
      const seedIndex = (position - 1) * 2;
      const sideA =
        round === 1
          ? seededSlot(seedOrder[seedIndex]!, teamCount)
          : previousWinners[(position - 1) * 2]!;
      const sideB =
        round === 1
          ? seededSlot(seedOrder[seedIndex + 1]!, teamCount)
          : previousWinners[(position - 1) * 2 + 1]!;
      const result = materializeMatch({
        key: `w-r${round}-m${position}`,
        label: `${winnerRoundLabel(round, winnersRoundCount)} ${position}`,
        bracket: "winners",
        round,
        position,
        sideA,
        sideB,
        x: round - 1,
        y: position - 1
      });
      next.push(result.winner);
    }
    previousWinners = next;
  }

  let previousLosers: DoubleSlot[] = [];
  if (winnersRoundCount > 1) {
    const firstRoundLosers = Array.from(
      { length: bracketSize / 2 },
      (_, index) => losers.get(`w-r1-m${index + 1}`)!
    );
    for (let position = 1; position <= bracketSize / 4; position += 1) {
      previousLosers.push(
        materializeMatch({
          key: `l-r1-m${position}`,
          label: `Chave inferior 1 · jogo ${position}`,
          bracket: "losers",
          round: 1,
          position,
          sideA: firstRoundLosers[(position - 1) * 2]!,
          sideB: firstRoundLosers[(position - 1) * 2 + 1]!,
          x: 0,
          y: position - 1
        }).winner
      );
    }

    for (let phase = 1; phase < winnersRoundCount; phase += 1) {
      const crossRound = phase * 2;
      const count = bracketSize / 2 ** (phase + 1);
      const winnerDrop = Array.from(
        { length: count },
        (_, index) => losers.get(`w-r${phase + 1}-m${index + 1}`)!
      );
      const orderedDrop =
        phase % 2 === 1 ? [...winnerDrop].reverse() : winnerDrop;
      const crossWinners: DoubleSlot[] = [];

      for (let position = 1; position <= count; position += 1) {
        crossWinners.push(
          materializeMatch({
            key: `l-r${crossRound}-m${position}`,
            label: `Chave inferior ${crossRound} · jogo ${position}`,
            bracket: "losers",
            round: crossRound,
            position,
            sideA: previousLosers[position - 1]!,
            sideB: orderedDrop[position - 1]!,
            x: crossRound - 1,
            y: position - 1
          }).winner
        );
      }
      previousLosers = crossWinners;

      if (phase < winnersRoundCount - 1) {
        const consolidationRound = crossRound + 1;
        const consolidated: DoubleSlot[] = [];
        for (let position = 1; position <= count / 2; position += 1) {
          consolidated.push(
            materializeMatch({
              key: `l-r${consolidationRound}-m${position}`,
              label: `Chave inferior ${consolidationRound} · jogo ${position}`,
              bracket: "losers",
              round: consolidationRound,
              position,
              sideA: previousLosers[(position - 1) * 2]!,
              sideB: previousLosers[(position - 1) * 2 + 1]!,
              x: consolidationRound - 1,
              y: position - 1
            }).winner
          );
        }
        previousLosers = consolidated;
      }
    }
  }

  const winnersChampion = previousWinners[0]!;
  const losersChampion =
    winnersRoundCount === 1 ? losers.get("w-r1-m1")! : previousLosers[0]!;
  const firstFinal = materializeMatch({
    key: "grand-final-1",
    label: grandFinalReset ? "Grande final 1" : "Grande final",
    bracket: "grand-final",
    round: 1,
    position: 1,
    sideA: winnersChampion,
    sideB: losersChampion,
    x: winnersRoundCount + losersRoundCount,
    y: 0
  });
  void firstFinal;

  const addPlacement = (key: string, label: string, y: number) => {
    spots.push({
      key,
      label,
      kind: "placement",
      displayOrder: spotOrder++,
      placementRank: key === "placement-champion" ? 1 : 2,
      teamIndex: null,
      x: winnersRoundCount + losersRoundCount + (grandFinalReset ? 2 : 1),
      y
    });
  };
  addPlacement("placement-champion", "Campeão", 0);
  addPlacement("placement-runner-up", "Vice-campeão", 1);

  if (grandFinalReset) {
    const reset = materializeMatch({
      key: "grand-final-reset",
      label: "Grande final decisiva",
      bracket: "grand-final",
      round: 2,
      position: 1,
      sideA: {
        possible: true,
        teamIndex: null,
        source: {
          matchKey: "grand-final-1",
          outcome: "loser",
          condition: "if-side-b-wins"
        }
      },
      sideB: {
        possible: true,
        teamIndex: null,
        source: {
          matchKey: "grand-final-1",
          outcome: "winner",
          condition: "if-side-b-wins"
        }
      },
      x: winnersRoundCount + losersRoundCount + 1,
      y: 0,
      activation: {
        sourceMatchKey: "grand-final-1",
        condition: "if-side-b-wins"
      }
    });
    routes.push(
      {
        sourceMatchKey: "grand-final-1",
        sourceOutcome: "winner",
        destinationSpotKey: "placement-champion",
        condition: "if-side-a-wins"
      },
      {
        sourceMatchKey: "grand-final-1",
        sourceOutcome: "loser",
        destinationSpotKey: "placement-runner-up",
        condition: "if-side-a-wins"
      },
      {
        sourceMatchKey: "grand-final-reset",
        sourceOutcome: "winner",
        destinationSpotKey: "placement-champion",
        condition: "always"
      },
      {
        sourceMatchKey: "grand-final-reset",
        sourceOutcome: "loser",
        destinationSpotKey: "placement-runner-up",
        condition: "always"
      }
    );
    void reset;
  } else {
    routes.push(
      {
        sourceMatchKey: "grand-final-1",
        sourceOutcome: "winner",
        destinationSpotKey: "placement-champion",
        condition: "always"
      },
      {
        sourceMatchKey: "grand-final-1",
        sourceOutcome: "loser",
        destinationSpotKey: "placement-runner-up",
        condition: "always"
      }
    );
  }

  return {
    bracketSize,
    winnersRoundCount,
    losersRoundCount,
    grandFinalReset,
    spots,
    matches,
    routes
  };
}

function seededSlot(seed: number, teamCount: number): DoubleSlot {
  return seed <= teamCount
    ? { possible: true, teamIndex: seed - 1, source: null }
    : { possible: false, teamIndex: null, source: null };
}

function winnerRoundLabel(round: number, roundCount: number): string {
  const label = roundLabel(round, roundCount);
  return label === "Final"
    ? "Final da chave superior"
    : `${label} da chave superior`;
}

function roundLabel(round: number, roundCount: number): string {
  const remaining = roundCount - round;

  if (remaining === 0) {
    return "Final";
  }
  if (remaining === 1) {
    return "Semifinal";
  }
  if (remaining === 2) {
    return "Quartas de final";
  }
  if (remaining === 3) {
    return "Oitavas de final";
  }

  return `Fase ${round}`;
}
