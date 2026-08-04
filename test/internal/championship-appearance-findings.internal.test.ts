import { describe, expect, it } from "bun:test";
import {
  buildAppearanceFindings,
  normalizePersistedAppearanceFindings
} from "@/features/championships/matches-statistics/appearance-findings";

describe("championship appearance findings", () => {
  it("distinguishes a linked account from enrollment in the edition", () => {
    expect(
      buildAppearanceFindings({
        hasSourceAccount: true,
        participantStatus: "missing",
        membership: "missing",
        ambiguousSide: false
      })
    ).toEqual(["edition-unregistered"]);
  });

  it("reports an enrolled participant without a team as off-roster", () => {
    expect(
      buildAppearanceFindings({
        hasSourceAccount: true,
        participantStatus: "active",
        membership: "missing",
        ambiguousSide: false
      })
    ).toEqual(["off-roster"]);
  });

  it("keeps historical players distinct from linked accounts", () => {
    expect(
      buildAppearanceFindings({
        hasSourceAccount: false,
        participantStatus: "missing",
        membership: "missing",
        ambiguousSide: true
      })
    ).toEqual(["unregistered", "ambiguous-side"]);
  });

  it("reads legacy persisted findings using the account and edition state", () => {
    expect(
      normalizePersistedAppearanceFindings(
        { unregistered: true, "off-roster": true },
        { hasSourceAccount: true, participantStatus: "missing" }
      )
    ).toEqual(["edition-unregistered"]);
  });

  it("preserves a stored finding for an active participant", () => {
    expect(
      normalizePersistedAppearanceFindings(
        { "off-roster": true },
        { hasSourceAccount: true, participantStatus: "active" }
      )
    ).toEqual(["off-roster"]);
  });
});
