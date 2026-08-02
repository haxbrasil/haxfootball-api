import { describe, expect, it } from "bun:test";
import { areProgramsCompatible } from "@/features/championships/matches-statistics/program-compatibility";

describe("championship room program compatibility", () => {
  it("accepts every active championship program, not only the default", () => {
    const allowed = new Set(["haxfootball-v2", "haxfootball-v1"]);

    expect(areProgramsCompatible(new Set(["haxfootball-v2"]), allowed)).toBe(
      true
    );
    expect(areProgramsCompatible(new Set(["haxfootball-v1"]), allowed)).toBe(
      true
    );
    expect(
      areProgramsCompatible(
        new Set(["haxfootball-v2", "haxfootball-v1"]),
        allowed
      )
    ).toBe(true);
  });

  it("rejects evidence containing a program outside the active set", () => {
    expect(
      areProgramsCompatible(
        new Set(["haxfootball-v1", "another-program"]),
        new Set(["haxfootball-v1", "haxfootball-v2"])
      )
    ).toBe(false);
  });

  it("keeps missing provenance and unconfigured championships permissive", () => {
    expect(areProgramsCompatible(new Set(), new Set(["haxfootball-v2"]))).toBe(
      true
    );
    expect(areProgramsCompatible(new Set(["legacy-program"]), new Set())).toBe(
      true
    );
  });
});
