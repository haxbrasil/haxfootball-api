import { eq } from "drizzle-orm";
import { type Static, t } from "elysia";
import { withDatabaseTransaction } from "@/db/client";
import {
  matchCompletionReasonSchema,
  matchEventInputSchema,
  matchScoreSchema
} from "@/features/matches/_shared/http/inputs";
import {
  physicalMatchResponseSchema,
  toMatchResponse
} from "@/features/matches/_shared/http/responses";
import {
  getMatchDetail,
  getMatchSummary,
  nextMatchEventSequence,
  persistMatchEvents,
  persistMatchScore,
  recomputeMatchStints
} from "@/features/matches/_shared/db/queries";
import { matches } from "@/features/matches/db";
import { badRequest } from "@/shared/http/errors";
import { promoteMatchRecordingCheckpoint } from "@/features/matches/promote-match-recording-checkpoint";

const checkpointStatusSchema = t.Union([
  t.Literal("pending"),
  t.Literal("ongoing"),
  t.Literal("completed"),
  t.Literal("discarded")
]);

export const checkpointMatchBodySchema = t.Object({
  revision: t.Integer({ minimum: 1 }),
  observedAt: t.String({ minLength: 1 }),
  elapsedSeconds: t.Number({ minimum: 0 }),
  score: matchScoreSchema,
  events: t.Array(matchEventInputSchema),
  status: t.Optional(checkpointStatusSchema),
  completionReason: t.Optional(matchCompletionReasonSchema)
});

export const checkpointMatchResponseSchema = t.Object({
  acknowledgedProducerSequence: t.Integer({ minimum: 0 }),
  match: physicalMatchResponseSchema
});

export type CheckpointMatchInput = Static<typeof checkpointMatchBodySchema>;

export async function checkpointMatch(id: string, input: CheckpointMatchInput) {
  const current = await getMatchSummary(id);

  if (input.revision <= current.match.lastCheckpointRevision) {
    return {
      acknowledgedProducerSequence: current.match.lastProducerSequence,
      match: toMatchResponse(await getMatchDetail(id))
    };
  }

  if (
    current.match.status === "completed" ||
    current.match.status === "discarded"
  ) {
    throw badRequest("Terminal matches cannot be checkpointed");
  }

  const sequencedEvents = input.events.map((event) => {
    if (!event.id || event.producerSequence === undefined) {
      throw badRequest(
        "Checkpoint events require id and producerSequence fields"
      );
    }

    return event;
  });
  const newEvents = sequencedEvents
    .filter(
      (event) =>
        event.producerSequence !== undefined &&
        event.producerSequence > current.match.lastProducerSequence
    )
    .sort(
      (left, right) =>
        (left.producerSequence ?? 0) - (right.producerSequence ?? 0)
    );

  for (const [index, event] of newEvents.entries()) {
    const expected = current.match.lastProducerSequence + index + 1;

    if (event.producerSequence !== expected) {
      throw badRequest(`Expected producer sequence ${expected}`);
    }
  }

  const nextProducerSequence =
    newEvents.at(-1)?.producerSequence ?? current.match.lastProducerSequence;
  const nextStatus = input.status ?? current.match.status;

  if (
    current.match.status === "ongoing" &&
    nextStatus !== "ongoing" &&
    nextStatus !== "completed"
  ) {
    throw badRequest("Ongoing matches cannot return to a provisional status");
  }

  if (nextStatus === "completed" && !input.completionReason) {
    throw badRequest("Completed checkpoints require a completion reason");
  }

  const startSequence = await nextMatchEventSequence(current.match.id);
  const now = new Date().toISOString();

  await withDatabaseTransaction(async (tx) => {
    await persistMatchEvents(current.match.id, newEvents, startSequence, tx);
    await persistMatchScore(current.match.id, input.score, tx);
    await recomputeMatchStints(current.match.id, tx);

    await tx
      .update(matches)
      .set({
        status: nextStatus,
        completionReason:
          nextStatus === "completed"
            ? (input.completionReason ?? current.match.completionReason)
            : null,
        endedAt:
          nextStatus === "completed" || nextStatus === "discarded"
            ? input.observedAt
            : null,
        lastCheckpointAt: input.observedAt,
        lastCheckpointRevision: input.revision,
        elapsedSeconds: input.elapsedSeconds,
        lastProducerSequence: nextProducerSequence,
        updatedAt: now
      })
      .where(eq(matches.id, current.match.id));
  });

  if (nextStatus === "completed") {
    await promoteMatchRecordingCheckpoint(id);
  }

  return {
    acknowledgedProducerSequence: nextProducerSequence,
    match: toMatchResponse(await getMatchDetail(id))
  };
}
