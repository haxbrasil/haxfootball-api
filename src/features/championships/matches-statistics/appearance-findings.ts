export type AppearanceParticipantStatus = "active" | "inactive" | "missing";

export type AppearanceMembershipState = "same-team" | "other-team" | "missing";

export type AppearanceFindingState = {
  hasSourceAccount: boolean;
  participantStatus: AppearanceParticipantStatus;
  membership: AppearanceMembershipState;
  ambiguousSide: boolean;
};

export function buildAppearanceFindings(
  state: AppearanceFindingState
): string[] {
  const findings: string[] = [];

  if (!state.hasSourceAccount) {
    findings.push("unregistered");
  } else if (state.participantStatus !== "active") {
    findings.push("edition-unregistered");
  } else if (state.membership === "other-team") {
    findings.push("wrong-side");
  } else if (state.membership === "missing") {
    findings.push("off-roster");
  }

  if (state.ambiguousSide) {
    findings.push("ambiguous-side");
  }

  return findings;
}

export function normalizePersistedAppearanceFindings(
  value: unknown,
  state: Pick<AppearanceFindingState, "hasSourceAccount" | "participantStatus">
): string[] {
  const stored = Array.isArray(value)
    ? value.filter((finding): finding is string => typeof finding === "string")
    : value && typeof value === "object"
      ? Object.entries(value)
          .filter(([, enabled]) => enabled === true)
          .map(([finding]) => finding)
      : [];

  const normalized = stored.map((finding) => {
    if (finding === "unregistered" && state.hasSourceAccount) {
      return "edition-unregistered";
    }
    return finding;
  });

  if (state.participantStatus !== "active") {
    return [...new Set(normalized)].filter(
      (finding) => finding !== "off-roster" && finding !== "wrong-side"
    );
  }

  return [...new Set(normalized)];
}
