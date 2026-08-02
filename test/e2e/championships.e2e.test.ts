import { Database } from "bun:sqlite";
import { beforeAll, describe, expect, it } from "bun:test";
import {
  paginatedBody,
  paginatedItems,
  request
} from "@/test/e2e/helpers/helpers";
import { MATCH_ROOM_EVENT } from "@/test/e2e/helpers/events";

type Account = {
  uuid: string;
  name: string;
};

type CompetitionType = {
  uuid: string;
  slug: string;
  name: string;
  revision: number;
  defaultRules: ChampionshipRules;
};

type Championship = {
  uuid: string;
  slug: string;
  name: string;
  revision: number;
  changeSequence: number;
  lifecycle: string;
  visibility: string;
  registrationState: "not-open" | "open" | "closed";
  priceState: "disabled" | "editable" | "locked";
  rules: ChampionshipRules;
  teams: Array<{
    uuid: string;
    name: string;
    rosterRevision: number;
    teamIdentity: { uuid: string; name: string } | null;
  }>;
  roomPrograms: Array<{
    uuid: string;
    state: string;
    isDefault: boolean;
  }>;
  grants: Array<{
    accountUuid: string;
    permission: string;
  }>;
};

type ChampionshipRules = ReturnType<typeof rules>;

let admin: Account;
let unprivileged: Account;
let competitionType: CompetitionType;
let draftGms: Account[];
let draftPlayers: Account[];

beforeAll(async () => {
  admin = await createAccountWithPermissions(["*"]);
  unprivileged = await createAccountWithPermissions([]);
  competitionType = await createCompetitionType(admin);
  draftGms = await Promise.all(
    Array.from({ length: 3 }, () => createAccountWithPermissions([]))
  );
  draftPlayers = await Promise.all(
    Array.from({ length: 4 }, () => createAccountWithPermissions([]))
  );
});

describe("championship core", () => {
  it("seeds the championship permission catalog and enforces actor authority", async () => {
    const permissionResponse = await request("/api/permissions?limit=100");
    const permissionKeys = (
      await paginatedItems<{ key: string }>(permissionResponse)
    ).map(({ key }) => key);

    expect(permissionKeys).toContain("championship:admin");
    expect(permissionKeys).toContain("championship:operate");
    expect(permissionKeys).toContain("championship-history:admin");

    const forbiddenResponse = await request(
      "/api/championships/competition-types",
      {
        method: "POST",
        body: {
          actorAccountUuid: unprivileged.uuid,
          commandUuid: crypto.randomUUID(),
          slug: uniqueSlug("forbidden"),
          name: "Forbidden",
          defaultRules: rules()
        }
      }
    );

    expect(forbiddenResponse.status).toBe(403);
    expect(await forbiddenResponse.json()).toEqual({
      error: {
        code: "FORBIDDEN",
        message: "Missing one of permissions: championship:admin"
      }
    });
  });

  it("copies type defaults into a private championship snapshot", async () => {
    const snapshotType = await createCompetitionType(admin);
    const championship = await createChampionship(admin, snapshotType, {
      name: "Snapshot Cup"
    });
    const updatedRules = rules({
      matchRounds: 1,
      salaryEnabled: true,
      capUnits: 900
    });
    const typeUpdateResponse = await request(
      `/api/championships/competition-types/${snapshotType.uuid}`,
      {
        method: "PATCH",
        body: {
          actorAccountUuid: admin.uuid,
          commandUuid: crypto.randomUUID(),
          expectedRevision: snapshotType.revision,
          defaultRules: updatedRules
        }
      }
    );

    expect(typeUpdateResponse.status).toBe(200);

    const privateListResponse = await request("/api/championships?limit=100");
    const allListResponse = await request(
      "/api/championships?visibility=all&limit=100"
    );
    const detailResponse = await request(
      `/api/championships/${championship.uuid}`
    );
    const detail = await detailResponse.json();

    expect(
      (await paginatedItems<{ uuid: string }>(privateListResponse)).map(
        ({ uuid }) => uuid
      )
    ).not.toContain(championship.uuid);
    expect(
      (await paginatedItems<{ uuid: string }>(allListResponse)).map(
        ({ uuid }) => uuid
      )
    ).toContain(championship.uuid);
    expect(
      await paginatedItems<{ uuid: string }>(
        await request(
          `/api/championships?visibility=all&slug=${championship.slug}&limit=1`
        )
      )
    ).toEqual([
      expect.objectContaining({
        uuid: championship.uuid
      })
    ]);
    expect(detailResponse.status).toBe(200);
    expect(detail.rules).toEqual(snapshotType.defaultRules);
    expect(detail.rules).not.toEqual(updatedRules);
  });

  it("creates identities, teams, and a mixed room-program allowlist", async () => {
    const firstProgram = await createRoomProgram("championship-a");
    const secondProgram = await createRoomProgram("championship-b");
    let championship = await createChampionship(admin, competitionType, {
      name: "Mixed Program Cup",
      roomProgramIds: [firstProgram.uuid, secondProgram.uuid],
      defaultRoomProgramId: firstProgram.uuid
    });
    const identityResponse = await request(
      `/api/championships/${championship.uuid}/team-identities`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          slug: uniqueSlug("identity"),
          name: "Aurora",
          abbreviation: "AUR",
          colors: ["#E63946", "#F1FAEE"]
        })
      }
    );

    expect(identityResponse.status).toBe(201);

    const identity = await identityResponse.json();
    championship = await getChampionship(championship.uuid);

    const teamResponse = await request(
      `/api/championships/${championship.uuid}/teams`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          teamIdentityId: identity.uuid,
          name: "Aurora Cup Team",
          displayOrder: 1
        })
      }
    );

    expect(teamResponse.status).toBe(201);
    const team = await teamResponse.json();

    expect(team).toMatchObject({
      name: "Aurora Cup Team",
      abbreviation: "AUR",
      colors: ["#E63946", "#F1FAEE"],
      teamIdentity: {
        uuid: identity.uuid,
        name: "Aurora"
      }
    });

    championship = await getChampionship(championship.uuid);
    const duplicateResponse = await request(
      `/api/championships/${championship.uuid}/teams`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          name: "Another Aurora",
          abbreviation: "AUR"
        })
      }
    );

    expect(duplicateResponse.status).toBe(400);
    expect(await duplicateResponse.json()).toMatchObject({
      error: {
        code: "BAD_REQUEST",
        message: "Championship team abbreviation already exists"
      }
    });
    expect((await getChampionship(championship.uuid)).revision).toBe(
      championship.revision
    );

    const teams = await paginatedItems<{ uuid: string }>(
      await request(`/api/championships/${championship.uuid}/teams?limit=1`)
    );
    const participants = await paginatedItems(
      await request(
        `/api/championships/${championship.uuid}/participants?limit=1`
      )
    );

    expect(teams).toEqual([
      expect.objectContaining({
        uuid: team.uuid
      })
    ]);
    expect(participants).toEqual([]);

    const identityUpdateResponse = await request(
      `/api/championships/${championship.uuid}/team-identities/${identity.uuid}`,
      {
        method: "PATCH",
        body: command(admin, championship.revision, {
          name: "Aurora Legacy",
          state: "archived"
        })
      }
    );

    expect(identityUpdateResponse.status).toBe(200);
    expect(await identityUpdateResponse.json()).toMatchObject({
      uuid: identity.uuid,
      name: "Aurora Legacy",
      archivedAt: expect.any(String)
    });

    championship = await getChampionship(championship.uuid);
    const defaultResponse = await request(
      `/api/championships/${championship.uuid}/room-programs`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          roomProgramId: secondProgram.uuid,
          operation: "set-default"
        })
      }
    );

    expect(defaultResponse.status).toBe(200);
    championship = await defaultResponse.json();
    expect(championship.roomPrograms).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          uuid: firstProgram.uuid,
          isDefault: false
        }),
        expect.objectContaining({
          uuid: secondProgram.uuid,
          isDefault: true
        })
      ])
    );
  });

  it("makes commands idempotent and returns useful stale revision conflicts", async () => {
    let championship = await createChampionship(admin, competitionType, {
      name: "Revision Cup"
    });
    const commandUuid = crypto.randomUUID();
    const body = {
      actorAccountUuid: admin.uuid,
      commandUuid,
      expectedRevision: championship.revision,
      transition: "publish"
    };
    const firstResponse = await request(
      `/api/championships/${championship.uuid}/transitions`,
      { method: "POST", body }
    );
    const retryResponse = await request(
      `/api/championships/${championship.uuid}/transitions`,
      { method: "POST", body }
    );

    expect(firstResponse.status).toBe(200);
    expect(retryResponse.status).toBe(200);
    const firstBody = await firstResponse.json();
    expect(await retryResponse.json()).toEqual(firstBody);

    championship = firstBody;

    const staleResponse = await request(
      `/api/championships/${championship.uuid}/transitions`,
      {
        method: "POST",
        body: {
          actorAccountUuid: admin.uuid,
          commandUuid: crypto.randomUUID(),
          expectedRevision: championship.revision - 1,
          transition: "activate"
        }
      }
    );

    expect(staleResponse.status).toBe(409);
    expect(await staleResponse.json()).toEqual({
      error: {
        code: "CONFLICT",
        message: "Championship revision does not match",
        details: {
          championshipUuid: championship.uuid,
          expectedRevision: championship.revision - 1,
          currentRevision: championship.revision,
          currentChangeSequence: championship.changeSequence
        }
      }
    });
  });

  it("guards lifecycle transitions and supports completed historical editions", async () => {
    const championship = await createChampionship(admin, competitionType, {
      name: "Lifecycle Cup"
    });
    const invalidArchiveResponse = await request(
      `/api/championships/${championship.uuid}/transitions`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          transition: "archive"
        })
      }
    );

    expect(invalidArchiveResponse.status).toBe(400);

    const historical = await createChampionship(admin, competitionType, {
      name: "Historical Cup",
      historical: true,
      createCompleted: true
    });

    expect(historical.lifecycle).toBe("completed");
    expect(historical.visibility).toBe("private");
  });

  it("soft-deletes championships only for championship administrators", async () => {
    const operator = await createAccountWithPermissions([
      "championship:operate"
    ]);
    const championship = await createChampionship(admin, competitionType, {
      name: "Disposable Cup"
    });
    const forbiddenDelete = await request(
      `/api/championships/${championship.uuid}/transitions`,
      {
        method: "POST",
        body: command(operator, championship.revision, {
          transition: "delete",
          reason: "Operator should not be allowed"
        })
      }
    );

    expect(forbiddenDelete.status).toBe(403);

    const deleted = await request(
      `/api/championships/${championship.uuid}/transitions`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          transition: "delete",
          reason: "Created by mistake"
        })
      }
    );

    expect(deleted.status).toBe(200);
    expect((await deleted.json()).visibility).toBe("private");

    const detail = await request(`/api/championships/${championship.uuid}`);
    expect(detail.status).toBe(404);

    const listed = await paginatedItems<Championship>(
      await request("/api/championships?visibility=all&limit=100")
    );
    expect(listed.some(({ uuid }) => uuid === championship.uuid)).toBe(false);
  });

  it("grants championship-scoped authority and records ordered audit events", async () => {
    let championship = await createChampionship(admin, competitionType, {
      name: "Delegated Cup"
    });
    const grantResponse = await request(
      `/api/championships/${championship.uuid}/grants`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          accountUuid: unprivileged.uuid,
          permission: "championship:admin",
          operation: "grant"
        })
      }
    );

    expect(grantResponse.status).toBe(200);
    championship = await grantResponse.json();
    expect(championship.grants).toContainEqual(
      expect.objectContaining({
        accountUuid: unprivileged.uuid,
        permission: "championship:admin"
      })
    );

    const delegatedResponse = await request(
      `/api/championships/${championship.uuid}/teams`,
      {
        method: "POST",
        body: command(unprivileged, championship.revision, {
          name: "Delegated Team"
        })
      }
    );

    expect(delegatedResponse.status).toBe(201);
    const delegatedTeam = await delegatedResponse.json();
    championship = await getChampionship(championship.uuid);

    const firstPageResponse = await request(
      `/api/championships/${championship.uuid}/audit?actorAccountUuid=${admin.uuid}&limit=2`
    );
    const firstPage = await paginatedBody<{
      sequence: number;
      action: string;
    }>(firstPageResponse);

    expect(firstPage.items.map(({ sequence }) => sequence)).toEqual([1, 2]);
    expect(firstPage.page.nextCursor).not.toBeNull();

    const secondPageResponse = await request(
      `/api/championships/${championship.uuid}/audit?actorAccountUuid=${admin.uuid}&limit=2&cursor=${encodeURIComponent(
        firstPage.page.nextCursor ?? ""
      )}`
    );
    const secondPage = await paginatedBody<{
      sequence: number;
      actor: { accountUuid: string | null };
    }>(secondPageResponse);

    expect(secondPage.items[0]?.sequence).toBe(3);
    expect(secondPage.items[0]?.actor.accountUuid).toBe(unprivileged.uuid);

    const filteredResponse = await request(
      `/api/championships/${championship.uuid}/audit?actorAccountUuid=${admin.uuid}&filterActorAccountUuid=${unprivileged.uuid}&action=team.created&targetType=team&targetUuid=${delegatedTeam.uuid}`
    );
    const filtered = await paginatedItems<{
      action: string;
      targetType: string;
      targetUuid: string | null;
      actor: { accountUuid: string | null };
      correlationUuid: string;
    }>(filteredResponse);

    expect(filtered).toEqual([
      expect.objectContaining({
        action: "team.created",
        actor: expect.objectContaining({
          accountUuid: unprivileged.uuid
        }),
        targetType: "team",
        targetUuid: delegatedTeam.uuid
      })
    ]);
    const correlationFiltered = await paginatedItems<{
      correlationUuid: string;
    }>(
      await request(
        `/api/championships/${championship.uuid}/audit?actorAccountUuid=${admin.uuid}&correlationUuid=${filtered[0]!.correlationUuid}`
      )
    );
    expect(correlationFiltered).toHaveLength(1);
  });

  it("keeps contextual discussion, mentions, and assignments together", async () => {
    let championship = await createChampionship(admin, competitionType, {
      name: "Collaboration Cup"
    });
    const threadResponse = await request(
      `/api/championships/${championship.uuid}/threads`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          contextType: "team",
          contextUuid: crypto.randomUUID(),
          title: "Confirm the roster",
          body: "Please check the final roster.",
          mentionAccountUuids: [unprivileged.uuid]
        })
      }
    );

    expect(threadResponse.status).toBe(201);
    const thread = await threadResponse.json();
    expect(thread).toMatchObject({
      state: "open",
      title: "Confirm the roster",
      commentCount: 1,
      latestComment: {
        body: "Please check the final roster.",
        mentions: [
          {
            accountUuid: unprivileged.uuid
          }
        ]
      }
    });

    const mentionedInbox = await paginatedItems<{
      uuid: string;
      kind: string;
      contextUuid: string;
      readAt: string | null;
    }>(
      await request(
        `/api/championships/inbox?actorAccountUuid=${unprivileged.uuid}&unreadOnly=true`
      )
    );

    expect(mentionedInbox).toContainEqual(
      expect.objectContaining({
        kind: "mention",
        contextUuid: thread.uuid
      })
    );
    const mention = mentionedInbox.find(
      (item) => item.contextUuid === thread.uuid
    );

    expect(mention).toBeDefined();

    const readResponse = await request(
      `/api/championships/inbox/${mention?.uuid}`,
      {
        method: "PATCH",
        body: {
          actorAccountUuid: unprivileged.uuid,
          operation: "read"
        }
      }
    );

    expect(readResponse.status).toBe(200);
    expect(await readResponse.json()).toMatchObject({
      uuid: mention?.uuid,
      readAt: expect.any(String)
    });
    expect(
      await paginatedItems(
        await request(
          `/api/championships/inbox?actorAccountUuid=${unprivileged.uuid}&unreadOnly=true`
        )
      )
    ).not.toContainEqual(expect.objectContaining({ uuid: mention?.uuid }));

    const foreignArchiveResponse = await request(
      `/api/championships/inbox/${mention?.uuid}`,
      {
        method: "PATCH",
        body: {
          actorAccountUuid: admin.uuid,
          operation: "archive"
        }
      }
    );

    expect(foreignArchiveResponse.status).toBe(404);

    championship = await getChampionship(championship.uuid);
    const assignmentResponse = await request(
      `/api/championships/${championship.uuid}/assignments`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          contextType: "team",
          contextUuid: thread.contextUuid,
          title: "Approve roster",
          assigneeAccountUuid: unprivileged.uuid
        })
      }
    );

    expect(assignmentResponse.status).toBe(201);
    const assignment = await assignmentResponse.json();
    expect(assignment).toMatchObject({
      title: "Approve roster",
      state: "open",
      assignee: {
        accountUuid: unprivileged.uuid
      }
    });

    championship = await getChampionship(championship.uuid);
    expect(
      (
        await request(
          `/api/championships/${championship.uuid}/history?actorAccountUuid=${unprivileged.uuid}`
        )
      ).status
    ).toBe(403);
    expect(
      (
        await request(
          `/api/championships/${championship.uuid}/history?actorAccountUuid=${admin.uuid}`
        )
      ).status
    ).toBe(200);
    const completeResponse = await request(
      `/api/championships/${championship.uuid}/assignments/${assignment.uuid}`,
      {
        method: "PATCH",
        body: command(admin, championship.revision, {
          state: "completed",
          reason: "Roster approved"
        })
      }
    );

    expect(completeResponse.status).toBe(200);
    expect(await completeResponse.json()).toMatchObject({
      state: "completed",
      completedAt: expect.any(String)
    });

    championship = await getChampionship(championship.uuid);
    const resolutionResponse = await request(
      `/api/championships/${championship.uuid}/threads/${thread.uuid}`,
      {
        method: "PATCH",
        body: command(admin, championship.revision, {
          state: "resolved"
        })
      }
    );

    expect(resolutionResponse.status).toBe(200);
    expect(await resolutionResponse.json()).toMatchObject({
      state: "resolved",
      resolvedBy: {
        accountUuid: admin.uuid
      },
      resolvedAt: expect.any(String)
    });
  });

  it("stores bounded per-account workspace views with one default", async () => {
    const championship = await createChampionship(admin, competitionType, {
      name: "Saved Views Cup"
    });
    const firstResponse = await request(
      `/api/championships/${championship.uuid}/saved-views`,
      {
        method: "PUT",
        body: {
          actorAccountUuid: admin.uuid,
          surface: "workspace",
          name: "Operação",
          state: { view: "teams", inspector: true },
          isDefault: true
        }
      }
    );
    const secondResponse = await request(
      `/api/championships/${championship.uuid}/saved-views`,
      {
        method: "PUT",
        body: {
          actorAccountUuid: admin.uuid,
          surface: "workspace",
          name: "Auditoria",
          state: { view: "activity", inspector: false },
          isDefault: true
        }
      }
    );

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);

    const firstPage = await paginatedBody<{
      uuid: string;
      name: string;
      state: Record<string, unknown>;
      isDefault: boolean;
    }>(
      await request(
        `/api/championships/${championship.uuid}/saved-views?actorAccountUuid=${admin.uuid}&surface=workspace&limit=1`
      )
    );

    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.page.nextCursor).not.toBeNull();

    const allViews = await paginatedItems<{
      name: string;
      state: Record<string, unknown>;
      isDefault: boolean;
    }>(
      await request(
        `/api/championships/${championship.uuid}/saved-views?actorAccountUuid=${admin.uuid}&surface=workspace&limit=10`
      )
    );

    expect(allViews).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Operação",
          state: { view: "teams", inspector: true },
          isDefault: false
        }),
        expect.objectContaining({
          name: "Auditoria",
          state: { view: "activity", inspector: false },
          isDefault: true
        })
      ])
    );
    expect(allViews.filter(({ isDefault }) => isDefault)).toHaveLength(1);
    expect((await getChampionship(championship.uuid)).revision).toBe(
      championship.revision
    );
  });

  it("treats collaborator presence as expiring transport state", async () => {
    const championship = await createChampionship(admin, competitionType, {
      name: "Presence Cup"
    });
    const originalRevision = championship.revision;
    const firstSession = crypto.randomUUID();
    const secondSession = crypto.randomUUID();

    const firstHeartbeat = await request(
      `/api/championships/${championship.uuid}/presence`,
      {
        method: "POST",
        body: {
          actorAccountUuid: admin.uuid,
          sessionUuid: firstSession,
          contextType: "salary",
          contextUuid: null
        }
      }
    );
    const secondHeartbeat = await request(
      `/api/championships/${championship.uuid}/presence`,
      {
        method: "POST",
        body: {
          actorAccountUuid: admin.uuid,
          sessionUuid: secondSession,
          contextType: "format",
          contextUuid: "bracket"
        }
      }
    );

    expect(firstHeartbeat.status).toBe(200);
    expect(secondHeartbeat.status).toBe(200);
    expect(await secondHeartbeat.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sessionUuid: firstSession,
          contextType: "salary"
        }),
        expect.objectContaining({
          sessionUuid: secondSession,
          contextType: "format"
        })
      ])
    );
    expect((await getChampionship(championship.uuid)).revision).toBe(
      originalRevision
    );
  });

  it("resumes the durable event stream after Last-Event-ID", async () => {
    let championship = await createChampionship(admin, competitionType, {
      name: "Streaming Cup"
    });
    const resumeAfter = championship.changeSequence;
    const teamResponse = await request(
      `/api/championships/${championship.uuid}/teams`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          name: "Streamed Team"
        })
      }
    );

    expect(teamResponse.status).toBe(201);
    championship = await getChampionship(championship.uuid);

    const streamResponse = await request(
      `/api/championships/${championship.uuid}/events?actorAccountUuid=${admin.uuid}`,
      {
        headers: {
          "last-event-id": String(resumeAfter)
        }
      }
    );
    const reader = streamResponse.body?.getReader();

    expect(streamResponse.status).toBe(200);
    expect(streamResponse.headers.get("content-type")).toContain(
      "text/event-stream"
    );
    expect(reader).toBeDefined();

    const firstChunk = await reader?.read();
    const text = new TextDecoder().decode(firstChunk?.value);

    expect(text).toContain(`id: ${championship.changeSequence}`);
    expect(text).toContain("event: championship-change");
    expect(text).toContain('"action":"team.created"');
    await reader?.cancel();
  });

  it("lets exactly one simultaneous command win a revision race", async () => {
    const championship = await createChampionship(admin, competitionType, {
      name: "Concurrent Cup"
    });
    const responses = await Promise.all([
      request(`/api/championships/${championship.uuid}/teams`, {
        method: "POST",
        body: command(admin, championship.revision, {
          name: "First contender"
        })
      }),
      request(`/api/championships/${championship.uuid}/teams`, {
        method: "POST",
        body: command(admin, championship.revision, {
          name: "Second contender"
        })
      })
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    const current = await getChampionship(championship.uuid);

    expect(current.revision).toBe(championship.revision + 1);
    expect(current.teams).toHaveLength(1);
  });
});

describe("championship registration, rosters, and salary", () => {
  it("allows an account to self-register without championship staff authority", async () => {
    const type = await createCompetitionType(admin, {
      name: "Open Registration",
      championshipRules: rules({ salaryEnabled: false })
    });
    let championship = await createChampionship(admin, type, {
      name: "Open Registration Cup"
    });
    const openResponse = await request(
      `/api/championships/${championship.uuid}/registration/transitions`,
      {
        method: "POST",
        body: command(admin, championship.revision, { operation: "open" })
      }
    );

    expect(openResponse.status).toBe(200);
    championship = await openResponse.json();

    const emptyLookupResponse = await request(
      `/api/championships/${championship.uuid}/registrations/self?actorAccountUuid=${unprivileged.uuid}`
    );

    expect(emptyLookupResponse.status).toBe(200);
    expect(await emptyLookupResponse.json()).toEqual({ participant: null });

    const registrationBody = command(unprivileged, championship.revision, {});
    const registrationResponse = await request(
      `/api/championships/${championship.uuid}/registrations/self`,
      {
        method: "POST",
        body: registrationBody
      }
    );

    expect(registrationResponse.status).toBe(201);
    expect(await registrationResponse.json()).toMatchObject({
      displayName: unprivileged.name,
      status: "active",
      origin: "self",
      identity: {
        kind: "account",
        accountUuid: unprivileged.uuid
      }
    });

    const registrationLookup = await (
      await request(
        `/api/championships/${championship.uuid}/registrations/self?actorAccountUuid=${unprivileged.uuid}`
      )
    ).json();

    expect(registrationLookup).toMatchObject({
      participant: {
        identity: { accountUuid: unprivileged.uuid },
        status: "active"
      }
    });
    championship = await getChampionship(championship.uuid);

    const closeResponse = await request(
      `/api/championships/${championship.uuid}/registration/transitions`,
      {
        method: "POST",
        body: command(admin, championship.revision, { operation: "close" })
      }
    );

    expect(closeResponse.status).toBe(200);

    const idempotentRetry = await request(
      `/api/championships/${championship.uuid}/registrations/self`,
      {
        method: "POST",
        body: registrationBody
      }
    );

    expect(idempotentRetry.status).toBe(201);
    expect(await idempotentRetry.json()).toMatchObject({
      displayName: unprivileged.name,
      status: "active"
    });
  });

  it("requires an open window for self-registration but lets staff register without a reason", async () => {
    const participantAccount = await createAccountWithPermissions([]);
    const type = await createCompetitionType(admin, {
      name: "Controlled Registration",
      championshipRules: rules({ salaryEnabled: false })
    });
    let championship = await createChampionship(admin, type, {
      name: "Controlled Registration Cup"
    });
    const closedSelfResponse = await request(
      `/api/championships/${championship.uuid}/registrations/self`,
      {
        method: "POST",
        body: command(participantAccount, championship.revision, {})
      }
    );

    expect(closedSelfResponse.status).toBe(409);

    const staffResponse = await request(
      `/api/championships/${championship.uuid}/participants`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          accountUuid: participantAccount.uuid
        })
      }
    );

    expect(staffResponse.status).toBe(201);
    expect(await staffResponse.json()).toMatchObject({
      status: "active",
      origin: "staff",
      displayName: participantAccount.name
    });
  });

  it("validates complete valuation before freezing and hides editable prices publicly", async () => {
    const first = await createAccountWithPermissions([]);
    const second = await createAccountWithPermissions([]);
    const fixture = await createSalaryFixture([first, second], {
      capUnits: 100
    });
    let championship = fixture.championship;
    const adminProjectionResponse = await request(
      `/api/championships/${championship.uuid}/salary/admin?actorAccountUuid=${admin.uuid}`
    );
    const adminProjection = await adminProjectionResponse.json();

    expect(adminProjectionResponse.status).toBe(200);
    expect(adminProjection.validation).toMatchObject({
      missingPriceCount: 2,
      canFreeze: false
    });

    const prematureFreezeResponse = await request(
      `/api/championships/${championship.uuid}/salary/prices/freeze`,
      {
        method: "POST",
        body: command(admin, championship.revision, {})
      }
    );

    expect(prematureFreezeResponse.status).toBe(409);

    const priceResponse = await request(
      `/api/championships/${championship.uuid}/salary/prices`,
      {
        method: "PUT",
        body: command(admin, championship.revision, {
          prices: fixture.participants.map((participant, index) => ({
            participantId: participant.uuid,
            priceUnits: index === 0 ? 60 : 40
          }))
        })
      }
    );

    expect(priceResponse.status).toBe(200);
    championship = await getChampionship(championship.uuid);

    const publicBeforeFreeze = await (
      await request(`/api/championships/${championship.uuid}/salary`)
    ).json();

    expect(
      publicBeforeFreeze.participants.items.map(
        ({ priceUnits }: { priceUnits: number | null }) => priceUnits
      )
    ).toEqual([null, null]);

    const closeResponse = await request(
      `/api/championships/${championship.uuid}/registration/transitions`,
      {
        method: "POST",
        body: command(admin, championship.revision, { operation: "close" })
      }
    );

    expect(closeResponse.status).toBe(200);
    championship = await closeResponse.json();

    const freezeResponse = await request(
      `/api/championships/${championship.uuid}/salary/prices/freeze`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          reason: "Valores publicados"
        })
      }
    );

    expect(freezeResponse.status).toBe(200);
    expect(await freezeResponse.json()).toMatchObject({
      priceState: "locked",
      validation: {
        missingPriceCount: 0,
        canFreeze: false
      }
    });

    const publicAfterFreeze = await (
      await request(`/api/championships/${championship.uuid}/salary`)
    ).json();

    expect(
      publicAfterFreeze.participants.items.map(
        ({ priceUnits }: { priceUnits: number | null }) => priceUnits
      )
    ).toEqual([60, 40]);
    expect(
      publicAfterFreeze.participants.items.every(
        ({ frozenAt }: { frozenAt: string | null }) =>
          typeof frozenAt === "string"
      )
    ).toBe(true);
  });

  it("locks price and salary-rule edits after the valuation freeze", async () => {
    const player = await createAccountWithPermissions([]);
    const fixture = await createFrozenSalaryFixture([player], {
      capUnits: 100,
      prices: [50]
    });
    const championship = fixture.championship;
    const priceEditResponse = await request(
      `/api/championships/${championship.uuid}/salary/prices`,
      {
        method: "PUT",
        body: command(admin, championship.revision, {
          prices: [
            {
              participantId: fixture.participants[0]!.uuid,
              priceUnits: 45
            }
          ]
        })
      }
    );

    expect(priceEditResponse.status).toBe(409);

    const ruleEditResponse = await request(
      `/api/championships/${championship.uuid}`,
      {
        method: "PATCH",
        body: command(admin, championship.revision, {
          rules: rules({ salaryEnabled: true, capUnits: 110 })
        })
      }
    );

    expect(ruleEditResponse.status).toBe(409);
  });

  it("counts frozen GM and player prices in cap projections", async () => {
    const gm = await createAccountWithPermissions([]);
    const player = await createAccountWithPermissions([]);
    const fixture = await createFrozenSalaryFixture([gm, player], {
      capUnits: 100,
      prices: [40, 55]
    });
    let championship = fixture.championship;
    const team = fixture.teams[0]!;
    const gmMoveResponse = await request(
      `/api/championships/${championship.uuid}/roster-moves`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          participantId: fixture.participants[0]!.uuid,
          targetTeamId: team.uuid,
          role: "gm"
        })
      }
    );

    expect(gmMoveResponse.status).toBe(200);
    expect(await gmMoveResponse.json()).toMatchObject({
      role: "gm",
      priceUnitsSnapshot: 40
    });
    championship = await getChampionship(championship.uuid);

    const playerMoveResponse = await request(
      `/api/championships/${championship.uuid}/roster-moves`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          participantId: fixture.participants[1]!.uuid,
          targetTeamId: team.uuid,
          role: "player"
        })
      }
    );

    expect(playerMoveResponse.status).toBe(200);
    championship = await getChampionship(championship.uuid);

    const projection = await (
      await request(`/api/championships/${championship.uuid}/salary`)
    ).json();

    expect(projection.teams.items[0]).toMatchObject({
      rosterSize: 2,
      usageUnits: 95,
      remainingUnits: 5,
      overCap: false,
      approvedOverCap: false
    });
  });

  it("previews cap violations and requires an explicit reasoned staff exception", async () => {
    const first = await createAccountWithPermissions([]);
    const second = await createAccountWithPermissions([]);
    const fixture = await createFrozenSalaryFixture([first, second], {
      capUnits: 100,
      prices: [70, 50]
    });
    let championship = fixture.championship;
    const team = fixture.teams[0]!;

    const firstMove = await request(
      `/api/championships/${championship.uuid}/roster-moves`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          participantId: fixture.participants[0]!.uuid,
          targetTeamId: team.uuid
        })
      }
    );

    expect(firstMove.status).toBe(200);
    championship = await getChampionship(championship.uuid);

    const previewResponse = await request(
      `/api/championships/${championship.uuid}/roster-moves/preview`,
      {
        method: "POST",
        body: {
          actorAccountUuid: admin.uuid,
          participantId: fixture.participants[1]!.uuid,
          targetTeamId: team.uuid,
          role: "player"
        }
      }
    );
    const preview = await previewResponse.json();

    expect(previewResponse.status).toBe(200);
    expect(preview).toMatchObject({
      requiresCapException: true,
      affectedTeams: [
        expect.objectContaining({
          usageBeforeUnits: 70,
          usageAfterUnits: 120,
          remainingAfterUnits: -20,
          overCapAfter: true
        })
      ]
    });

    const unconfirmedResponse = await request(
      `/api/championships/${championship.uuid}/roster-moves`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          participantId: fixture.participants[1]!.uuid,
          targetTeamId: team.uuid
        })
      }
    );

    expect(unconfirmedResponse.status).toBe(409);

    const reasonlessResponse = await request(
      `/api/championships/${championship.uuid}/roster-moves`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          participantId: fixture.participants[1]!.uuid,
          targetTeamId: team.uuid,
          confirmCapException: true
        })
      }
    );

    expect(reasonlessResponse.status).toBe(400);

    const approvedResponse = await request(
      `/api/championships/${championship.uuid}/roster-moves`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          participantId: fixture.participants[1]!.uuid,
          targetTeamId: team.uuid,
          confirmCapException: true,
          reason: "Exceção aprovada pela organização"
        })
      }
    );

    expect(approvedResponse.status).toBe(200);
    championship = await getChampionship(championship.uuid);

    const publicProjection = await (
      await request(`/api/championships/${championship.uuid}/salary`)
    ).json();
    const adminProjection = await (
      await request(
        `/api/championships/${championship.uuid}/salary/admin?actorAccountUuid=${admin.uuid}`
      )
    ).json();

    expect(publicProjection.teams.items[0]).toMatchObject({
      usageUnits: 120,
      overCap: true,
      approvedOverCap: true,
      activeException: {
        reason: null
      }
    });
    expect(adminProjection.teams.items[0]).toMatchObject({
      activeException: {
        reason: "Exceção aprovada pela organização"
      }
    });
  });

  it("expires an approved cap exception on the next roster mutation", async () => {
    const expensive = await createAccountWithPermissions([]);
    const replacement = await createAccountWithPermissions([]);
    const fixture = await createFrozenSalaryFixture([expensive, replacement], {
      capUnits: 50,
      prices: [60, 0]
    });
    let championship = fixture.championship;
    const team = fixture.teams[0]!;
    const exceptionalMove = await request(
      `/api/championships/${championship.uuid}/roster-moves`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          participantId: fixture.participants[0]!.uuid,
          targetTeamId: team.uuid,
          confirmCapException: true,
          reason: "Exceção temporária"
        })
      }
    );

    expect(exceptionalMove.status).toBe(200);
    championship = await getChampionship(championship.uuid);

    const removalResponse = await request(
      `/api/championships/${championship.uuid}/roster-moves`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          participantId: fixture.participants[0]!.uuid,
          targetTeamId: null,
          reason: "Substituição"
        })
      }
    );

    expect(removalResponse.status).toBe(200);
    championship = await getChampionship(championship.uuid);

    const projection = await (
      await request(`/api/championships/${championship.uuid}/salary`)
    ).json();

    expect(projection.teams.items[0]).toMatchObject({
      rosterRevision: 2,
      usageUnits: 0,
      overCap: false,
      approvedOverCap: false,
      activeException: null
    });

    const history = await paginatedItems<{
      participant: { uuid: string };
      endedAt: string | null;
      effectiveToRevision: number | null;
    }>(
      await request(
        `/api/championships/${championship.uuid}/roster-history?participantId=${fixture.participants[0]!.uuid}&limit=1`
      )
    );

    expect(history).toEqual([
      expect.objectContaining({
        participant: {
          uuid: fixture.participants[0]!.uuid,
          displayName: expensive.name
        },
        endedAt: expect.any(String),
        effectiveToRevision: 2
      })
    ]);
  });

  it("accepts a one-time frozen value for a late staff registration", async () => {
    const initial = await createAccountWithPermissions([]);
    const late = await createAccountWithPermissions([]);
    const fixture = await createFrozenSalaryFixture([initial], {
      capUnits: 100,
      prices: [40]
    });
    let championship = fixture.championship;
    const missingPriceResponse = await request(
      `/api/championships/${championship.uuid}/participants`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          accountUuid: late.uuid,
          reason: "Substituição após o fechamento"
        })
      }
    );

    expect(missingPriceResponse.status).toBe(409);

    const lateResponse = await request(
      `/api/championships/${championship.uuid}/participants`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          accountUuid: late.uuid,
          priceUnits: 35,
          reason: "Substituição após o fechamento"
        })
      }
    );

    expect(lateResponse.status).toBe(201);
    championship = await getChampionship(championship.uuid);

    const projection = await (
      await request(
        `/api/championships/${championship.uuid}/salary/admin?actorAccountUuid=${admin.uuid}`
      )
    ).json();
    const latePrice = projection.participants.items.find(
      ({ displayName }: { displayName: string }) => displayName === late.name
    );

    expect(latePrice).toMatchObject({
      priceUnits: 35,
      frozenAt: expect.any(String)
    });
  });
});

describe("championship draft and trades", () => {
  it("prevents an unpicked player from withdrawing while the draft is live", async () => {
    const fixture = await createDraftFixture({
      teamCount: 2,
      playerCount: 2,
      rounds: 1
    });
    let championship = fixture.championship;
    const draft = fixture.draft.draft!;
    const startResponse = await request(
      `/api/championships/${championship.uuid}/draft/start`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          expectedDraftRevision: draft.revision
        })
      }
    );

    expect(startResponse.status).toBe(200);
    championship = await getChampionship(championship.uuid);
    const withdrawResponse = await request(
      `/api/championships/${championship.uuid}/registrations/self/withdraw`,
      {
        method: "POST",
        body: command(fixture.players[0]!, championship.revision, {})
      }
    );

    expect(withdrawResponse.status).toBe(409);
    expect(await withdrawResponse.json()).toEqual({
      error: {
        code: "CONFLICT",
        message:
          "Participants cannot withdraw while a draft is live or after it has completed"
      }
    });
  });

  it("cancels a configured draft and allows a fresh configuration", async () => {
    const fixture = await createDraftFixture({
      teamCount: 2,
      playerCount: 2,
      rounds: 2
    });
    let championship = fixture.championship;
    const draft = fixture.draft.draft!;
    const cancelResponse = await request(
      `/api/championships/${championship.uuid}/draft/cancel`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          expectedDraftRevision: draft.revision,
          reason: "Draft criado por engano"
        })
      }
    );

    expect(cancelResponse.status).toBe(200);
    expect(await cancelResponse.json()).toEqual({ draft: null });
    expect(
      await (
        await request(`/api/championships/${championship.uuid}/draft`)
      ).json()
    ).toEqual({ draft: null });

    championship = await getChampionship(championship.uuid);
    const configureResponse = await request(
      `/api/championships/${championship.uuid}/draft`,
      {
        method: "PUT",
        body: command(admin, championship.revision, {
          teamIds: fixture.teams.map(({ uuid }) => uuid),
          rounds: 1,
          countdownSeconds: 30
        })
      }
    );

    expect(configureResponse.status).toBe(200);
    expect(await configureResponse.json()).toMatchObject({
      draft: {
        state: "setup",
        rounds: 1,
        countdownSeconds: 30
      }
    });
  });

  it("cancels a live draft with no picks but protects roster-changing picks", async () => {
    const emptyFixture = await createDraftFixture({
      teamCount: 2,
      playerCount: 2,
      rounds: 1
    });
    let championship = emptyFixture.championship;
    let draft = emptyFixture.draft.draft!;
    const startResponse = await request(
      `/api/championships/${championship.uuid}/draft/start`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          expectedDraftRevision: draft.revision
        })
      }
    );

    draft = (await startResponse.json()).draft;
    championship = await getChampionship(championship.uuid);
    const cancelResponse = await request(
      `/api/championships/${championship.uuid}/draft/cancel`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          expectedDraftRevision: draft.revision,
          reason: "Draft não será utilizado"
        })
      }
    );

    expect(cancelResponse.status).toBe(200);
    expect(await cancelResponse.json()).toEqual({ draft: null });

    const pickedFixture = await createDraftFixture({
      teamCount: 2,
      playerCount: 2,
      rounds: 1
    });
    championship = pickedFixture.championship;
    draft = pickedFixture.draft.draft!;
    const pickedStart = await request(
      `/api/championships/${championship.uuid}/draft/start`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          expectedDraftRevision: draft.revision
        })
      }
    );
    draft = (await pickedStart.json()).draft;
    championship = await getChampionship(championship.uuid);
    const pickResponse = await request(
      `/api/championships/${championship.uuid}/draft/picks`,
      {
        method: "POST",
        body: command(pickedFixture.gms[0]!, championship.revision, {
          expectedDraftRevision: draft.revision,
          participantId: pickedFixture.playerParticipants[0]!.uuid
        })
      }
    );
    draft = (await pickResponse.json()).draft;
    championship = await getChampionship(championship.uuid);
    const blockedCancel = await request(
      `/api/championships/${championship.uuid}/draft/cancel`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          expectedDraftRevision: draft.revision,
          reason: "Tentativa com escolha preenchida"
        })
      }
    );

    expect(blockedCancel.status).toBe(409);
    expect(await blockedCancel.json()).toMatchObject({
      error: {
        code: "CONFLICT",
        message: "Draft picks must be reversed before cancellation",
        details: { filledPickCount: 1 }
      }
    });
  });

  it("materializes a bounded serpentine board and requires active GMs before start", async () => {
    const fixture = await createDraftFixture({
      teamCount: 3,
      playerCount: 3,
      rounds: 2
    });
    const draft = fixture.draft.draft!;

    expect(draft.state).toBe("setup");
    expect(
      draft.teams.map(({ position }: { position: number }) => position)
    ).toEqual([1, 2, 3]);
    expect(
      draft.turns.items.map(({ team }: { team: { uuid: string } }) => team.uuid)
    ).toEqual([
      fixture.teams[0]!.uuid,
      fixture.teams[1]!.uuid,
      fixture.teams[2]!.uuid,
      fixture.teams[2]!.uuid,
      fixture.teams[1]!.uuid,
      fixture.teams[0]!.uuid
    ]);

    const firstPage = await (
      await request(
        `/api/championships/${fixture.championship.uuid}/draft?turnLimit=2&participantLimit=2`
      )
    ).json();

    expect(firstPage.draft.turns.items).toHaveLength(2);
    expect(firstPage.draft.turns.page.nextCursor).toEqual(expect.any(String));
    expect(firstPage.draft.availableParticipants.items).toHaveLength(2);
    expect(firstPage.draft.availableParticipants.page.nextCursor).toEqual(
      expect.any(String)
    );

    let championship = fixture.championship;
    const gmRemoval = await request(
      `/api/championships/${championship.uuid}/roster-moves`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          participantId: fixture.gmParticipants[2]!.uuid,
          targetTeamId: null,
          reason: "Teste de bloqueio sem GM"
        })
      }
    );

    expect(gmRemoval.status).toBe(200);
    championship = await getChampionship(championship.uuid);
    const startWithoutGm = await request(
      `/api/championships/${championship.uuid}/draft/start`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          expectedDraftRevision: draft.revision
        })
      }
    );

    expect(startWithoutGm.status).toBe(409);
    expect(await startWithoutGm.json()).toMatchObject({
      error: {
        code: "CONFLICT",
        message: "Every draft team needs an active GM",
        details: {
          missingGms: [
            {
              uuid: fixture.teams[2]!.uuid
            }
          ]
        }
      }
    });
  });

  it("authorizes the on-clock GM, snapshots the pick, and advances in order", async () => {
    const fixture = await createDraftFixture({
      teamCount: 2,
      playerCount: 4,
      rounds: 2
    });
    let championship = fixture.championship;
    let draft = fixture.draft.draft!;
    const startResponse = await request(
      `/api/championships/${championship.uuid}/draft/start`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          expectedDraftRevision: draft.revision
        })
      }
    );

    expect(startResponse.status).toBe(200);
    draft = (await startResponse.json()).draft;
    championship = await getChampionship(championship.uuid);

    const wrongGmResponse = await request(
      `/api/championships/${championship.uuid}/draft/picks`,
      {
        method: "POST",
        body: command(fixture.gms[1]!, championship.revision, {
          expectedDraftRevision: draft.revision,
          participantId: fixture.playerParticipants[0]!.uuid
        })
      }
    );

    expect(wrongGmResponse.status).toBe(409);

    const pickCommand = command(fixture.gms[0]!, championship.revision, {
      expectedDraftRevision: draft.revision,
      participantId: fixture.playerParticipants[0]!.uuid
    });
    const pickResponse = await request(
      `/api/championships/${championship.uuid}/draft/picks`,
      {
        method: "POST",
        body: pickCommand
      }
    );

    expect(pickResponse.status).toBe(200);
    draft = (await pickResponse.json()).draft;
    expect(draft.turns.items[0]).toMatchObject({
      state: "filled",
      selectedParticipant: {
        uuid: fixture.playerParticipants[0]!.uuid
      },
      priceUnitsSnapshot: fixture.playerPrices[0]
    });
    expect(draft.turns.items[1]).toMatchObject({
      state: "open",
      team: {
        uuid: fixture.teams[1]!.uuid
      }
    });
    expect(draft.teams[0]).toMatchObject({
      rosterSize: 2,
      usageUnits: fixture.gmPrice + fixture.playerPrices[0]!
    });

    const idempotentRetry = await request(
      `/api/championships/${championship.uuid}/draft/picks`,
      {
        method: "POST",
        body: pickCommand
      }
    );

    expect(idempotentRetry.status).toBe(200);
    expect((await idempotentRetry.json()).draft.revision).toBe(draft.revision);

    const history = await paginatedItems<{
      acquisitionSource: string;
      acquisitionReferenceUuid: string;
      participant: { uuid: string };
    }>(
      await request(
        `/api/championships/${championship.uuid}/roster-history?participantId=${fixture.playerParticipants[0]!.uuid}`
      )
    );

    expect(history).toEqual([
      expect.objectContaining({
        acquisitionSource: "draft",
        acquisitionReferenceUuid: draft.turns.items[0]!.uuid,
        participant: expect.objectContaining({
          uuid: fixture.playerParticipants[0]!.uuid
        })
      })
    ]);
  });

  it("keeps timed-out picks eligible while a later GM can win the same-player race", async () => {
    const fixture = await createDraftFixture({
      teamCount: 2,
      playerCount: 4,
      rounds: 2,
      countdownSeconds: 1
    });
    let championship = fixture.championship;
    let draft = fixture.draft.draft!;
    const startResponse = await request(
      `/api/championships/${championship.uuid}/draft/start`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          expectedDraftRevision: draft.revision
        })
      }
    );

    expect(startResponse.status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 1_100));

    const caughtUp = await (
      await request(
        `/api/championships/${championship.uuid}/draft?actorAccountUuid=${fixture.gms[0]!.uuid}`
      )
    ).json();
    draft = caughtUp.draft;
    championship = await getChampionship(championship.uuid);

    expect(
      draft.turns.items.slice(0, 2).map(({ state }: { state: string }) => state)
    ).toEqual(["overdue", "open"]);
    expect(draft.actor.eligibleTurnIds).toContain(draft.turns.items[0]!.uuid);

    const raceBodies = fixture.gms.map((gm) =>
      command(gm, championship.revision, {
        expectedDraftRevision: draft.revision,
        participantId: fixture.playerParticipants[0]!.uuid
      })
    );
    const raceResponses = await Promise.all(
      raceBodies.map((body) =>
        request(`/api/championships/${championship.uuid}/draft/picks`, {
          method: "POST",
          body
        })
      )
    );

    expect(raceResponses.map(({ status }) => status).sort()).toEqual([
      200, 409
    ]);

    const current = await (
      await request(`/api/championships/${championship.uuid}/draft`)
    ).json();
    const selectedTurns = current.draft.turns.items.filter(
      ({
        selectedParticipant
      }: {
        selectedParticipant: { uuid: string } | null;
      }) => selectedParticipant?.uuid === fixture.playerParticipants[0]!.uuid
    );

    expect(selectedTurns).toHaveLength(1);
    expect(
      current.draft.turns.items.filter(
        ({ state }: { state: string }) =>
          state === "open" || state === "overdue"
      ).length
    ).toBeGreaterThan(0);
  });

  it("rejects cap-invalid picks and previews a safe staff reversal before reopening it", async () => {
    const fixture = await createDraftFixture({
      teamCount: 2,
      playerCount: 3,
      rounds: 1,
      capUnits: 50,
      gmPrice: 20,
      playerPrices: [40, 25, 20]
    });
    let championship = fixture.championship;
    let draft = fixture.draft.draft!;
    const startResponse = await request(
      `/api/championships/${championship.uuid}/draft/start`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          expectedDraftRevision: draft.revision
        })
      }
    );

    draft = (await startResponse.json()).draft;
    championship = await getChampionship(championship.uuid);
    const invalidPick = await request(
      `/api/championships/${championship.uuid}/draft/picks`,
      {
        method: "POST",
        body: command(fixture.gms[0]!, championship.revision, {
          expectedDraftRevision: draft.revision,
          participantId: fixture.playerParticipants[0]!.uuid
        })
      }
    );

    expect(invalidPick.status).toBe(409);

    const validPick = await request(
      `/api/championships/${championship.uuid}/draft/picks`,
      {
        method: "POST",
        body: command(fixture.gms[0]!, championship.revision, {
          expectedDraftRevision: draft.revision,
          participantId: fixture.playerParticipants[1]!.uuid
        })
      }
    );

    expect(validPick.status).toBe(200);
    draft = (await validPick.json()).draft;
    championship = await getChampionship(championship.uuid);
    const selectedTurn = draft.turns.items[0]!;
    const previewResponse = await request(
      `/api/championships/${championship.uuid}/draft/turns/${selectedTurn.uuid}/correction-preview?actorAccountUuid=${admin.uuid}`
    );
    const preview = await previewResponse.json();

    expect(previewResponse.status).toBe(200);
    expect(preview).toMatchObject({
      canReverse: true,
      participant: {
        uuid: fixture.playerParticipants[1]!.uuid
      },
      reopenedState: "overdue",
      team: {
        usageAfterUnits: fixture.gmPrice,
        remainingAfterUnits: 30
      }
    });

    const reverseResponse = await request(
      `/api/championships/${championship.uuid}/draft/turns/${selectedTurn.uuid}/void`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          expectedDraftRevision: draft.revision,
          reason: "Escolha registrada para o atleta errado"
        })
      }
    );

    expect(reverseResponse.status).toBe(200);
    const reversed = (await reverseResponse.json()).draft;

    expect(reversed.state).toBe("live");
    expect(reversed.turns.items[0]).toMatchObject({
      state: "overdue",
      selectedParticipant: null,
      priceUnitsSnapshot: null
    });
    expect(
      reversed.availableParticipants.items.map(
        ({ uuid }: { uuid: string }) => uuid
      )
    ).toContain(fixture.playerParticipants[1]!.uuid);
  });

  it("ends explicitly without deleting overdue or pending turn history", async () => {
    const fixture = await createDraftFixture({
      teamCount: 2,
      playerCount: 2,
      rounds: 3
    });
    let championship = fixture.championship;
    let draft = fixture.draft.draft!;
    const startResponse = await request(
      `/api/championships/${championship.uuid}/draft/start`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          expectedDraftRevision: draft.revision
        })
      }
    );

    draft = (await startResponse.json()).draft;
    championship = await getChampionship(championship.uuid);
    const endResponse = await request(
      `/api/championships/${championship.uuid}/draft/end`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          expectedDraftRevision: draft.revision,
          reason: "Elencos concluídos antes das rodadas configuradas"
        })
      }
    );

    expect(endResponse.status).toBe(200);
    const ended = (await endResponse.json()).draft;

    expect(ended.state).toBe("completed");
    expect(ended.turns.items).toHaveLength(6);
    expect(
      ended.turns.items.every(
        ({ state }: { state: string }) => state === "voided"
      )
    ).toBe(true);
  });

  it("keeps pending negotiations private and applies an accepted trade atomically", async () => {
    const fixture = await createTradeFixture();
    let championship = fixture.championship;
    const unauthorizedProposal = await request(
      `/api/championships/${championship.uuid}/trades`,
      {
        method: "POST",
        body: command(fixture.players[0]!, championship.revision, {
          proposingTeamId: fixture.teams[0]!.uuid,
          receivingTeamId: fixture.teams[1]!.uuid,
          proposingParticipantIds: [fixture.playerParticipants[0]!.uuid],
          receivingParticipantIds: [fixture.playerParticipants[2]!.uuid]
        })
      }
    );

    expect(unauthorizedProposal.status).toBe(403);

    const proposalResponse = await request(
      `/api/championships/${championship.uuid}/trades`,
      {
        method: "POST",
        body: command(fixture.gms[0]!, championship.revision, {
          proposingTeamId: fixture.teams[0]!.uuid,
          receivingTeamId: fixture.teams[1]!.uuid,
          proposingParticipantIds: [fixture.playerParticipants[0]!.uuid],
          receivingParticipantIds: [fixture.playerParticipants[2]!.uuid]
        })
      }
    );

    expect(proposalResponse.status).toBe(201);
    const trade = await proposalResponse.json();
    expect(trade).toMatchObject({
      state: "proposed",
      proposingValueUnits: 40,
      receivingValueUnits: 35,
      valueDifferenceUnits: 5,
      actorActions: {
        canCancel: true
      }
    });
    championship = await getChampionship(championship.uuid);

    const publicPending = await paginatedItems(
      await request(`/api/championships/${championship.uuid}/trades`)
    );
    const involvedPending = await paginatedItems<{
      uuid: string;
      actorActions: { canAccept: boolean };
    }>(
      await request(
        `/api/championships/${championship.uuid}/trades?visibility=involved&actorAccountUuid=${fixture.gms[1]!.uuid}`
      )
    );

    expect(publicPending).toEqual([]);
    expect(involvedPending).toEqual([
      expect.objectContaining({
        uuid: trade.uuid,
        actorActions: expect.objectContaining({
          canAccept: true
        })
      })
    ]);

    const wrongAcceptance = await request(
      `/api/championships/${championship.uuid}/trades/${trade.uuid}/accept`,
      {
        method: "POST",
        body: command(fixture.gms[0]!, championship.revision, {
          expectedTradeRevision: trade.revision
        })
      }
    );

    expect(wrongAcceptance.status).toBe(403);

    const acceptanceResponse = await request(
      `/api/championships/${championship.uuid}/trades/${trade.uuid}/accept`,
      {
        method: "POST",
        body: command(fixture.gms[1]!, championship.revision, {
          expectedTradeRevision: trade.revision
        })
      }
    );

    expect(acceptanceResponse.status).toBe(200);
    expect(await acceptanceResponse.json()).toMatchObject({
      state: "accepted",
      revision: 1,
      actorActions: {
        canAccept: false,
        canCancel: false
      }
    });
    championship = await getChampionship(championship.uuid);

    const publicAccepted = await paginatedItems<{
      uuid: string;
      state: string;
    }>(await request(`/api/championships/${championship.uuid}/trades`));
    expect(publicAccepted).toEqual([
      expect.objectContaining({
        uuid: trade.uuid,
        state: "accepted"
      })
    ]);

    const salary = await (
      await request(`/api/championships/${championship.uuid}/salary`)
    ).json();
    const firstTeam = salary.teams.items.find(
      ({ uuid }: { uuid: string }) => uuid === fixture.teams[0]!.uuid
    );
    const secondTeam = salary.teams.items.find(
      ({ uuid }: { uuid: string }) => uuid === fixture.teams[1]!.uuid
    );

    expect(firstTeam).toMatchObject({
      rosterRevision: fixture.rosterRevisions[0] + 1,
      usageUnits: 10 + 30 + 35,
      overCap: false
    });
    expect(secondTeam).toMatchObject({
      rosterRevision: fixture.rosterRevisions[1] + 1,
      usageUnits: 10 + 25 + 40,
      overCap: false
    });

    const history = await paginatedItems<{
      team: { uuid: string };
      acquisitionSource: string;
      endedAt: string | null;
    }>(
      await request(
        `/api/championships/${championship.uuid}/roster-history?participantId=${fixture.playerParticipants[0]!.uuid}`
      )
    );

    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({
      team: { uuid: fixture.teams[0]!.uuid },
      endedAt: expect.any(String)
    });
    expect(history[1]).toMatchObject({
      team: { uuid: fixture.teams[1]!.uuid },
      acquisitionSource: "trade",
      endedAt: null
    });
  });

  it("rejects excessive value differences and stale trade ownership", async () => {
    const fixture = await createTradeFixture();
    let championship = fixture.championship;
    const excessiveResponse = await request(
      `/api/championships/${championship.uuid}/trades`,
      {
        method: "POST",
        body: command(fixture.gms[0]!, championship.revision, {
          proposingTeamId: fixture.teams[0]!.uuid,
          receivingTeamId: fixture.teams[1]!.uuid,
          proposingParticipantIds: [fixture.playerParticipants[0]!.uuid],
          receivingParticipantIds: [fixture.playerParticipants[3]!.uuid]
        })
      }
    );

    expect(excessiveResponse.status).toBe(409);

    const proposalResponse = await request(
      `/api/championships/${championship.uuid}/trades`,
      {
        method: "POST",
        body: command(fixture.gms[0]!, championship.revision, {
          proposingTeamId: fixture.teams[0]!.uuid,
          receivingTeamId: fixture.teams[1]!.uuid,
          proposingParticipantIds: [fixture.playerParticipants[1]!.uuid],
          receivingParticipantIds: [fixture.playerParticipants[3]!.uuid]
        })
      }
    );

    expect(proposalResponse.status).toBe(201);
    const trade = await proposalResponse.json();
    championship = await getChampionship(championship.uuid);

    const interveningMove = await request(
      `/api/championships/${championship.uuid}/roster-moves`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          participantId: fixture.playerParticipants[3]!.uuid,
          targetTeamId: null,
          reason: "Jogador indisponível antes da resposta"
        })
      }
    );

    expect(interveningMove.status).toBe(200);
    championship = await getChampionship(championship.uuid);

    const staleAcceptance = await request(
      `/api/championships/${championship.uuid}/trades/${trade.uuid}/accept`,
      {
        method: "POST",
        body: command(fixture.gms[1]!, championship.revision, {
          expectedTradeRevision: trade.revision
        })
      }
    );

    expect(staleAcceptance.status).toBe(409);
    const involved = await paginatedItems<{ uuid: string; state: string }>(
      await request(
        `/api/championships/${championship.uuid}/trades?visibility=involved&actorAccountUuid=${fixture.gms[0]!.uuid}`
      )
    );

    expect(involved).toContainEqual(
      expect.objectContaining({
        uuid: trade.uuid,
        state: "proposed"
      })
    );
  });

  it("supports receiving-GM rejection and proposing-GM cancellation", async () => {
    const fixture = await createTradeFixture();
    let championship = fixture.championship;
    const firstProposal = await request(
      `/api/championships/${championship.uuid}/trades`,
      {
        method: "POST",
        body: command(fixture.gms[0]!, championship.revision, {
          proposingTeamId: fixture.teams[0]!.uuid,
          receivingTeamId: fixture.teams[1]!.uuid,
          proposingParticipantIds: [fixture.playerParticipants[1]!.uuid],
          receivingParticipantIds: [fixture.playerParticipants[3]!.uuid]
        })
      }
    );
    const firstTrade = await firstProposal.json();
    championship = await getChampionship(championship.uuid);
    const rejection = await request(
      `/api/championships/${championship.uuid}/trades/${firstTrade.uuid}/reject`,
      {
        method: "POST",
        body: command(fixture.gms[1]!, championship.revision, {
          expectedTradeRevision: firstTrade.revision,
          reason: "A troca não atende ao plano do elenco"
        })
      }
    );

    expect(rejection.status).toBe(200);
    expect(await rejection.json()).toMatchObject({ state: "rejected" });
    championship = await getChampionship(championship.uuid);

    const secondProposal = await request(
      `/api/championships/${championship.uuid}/trades`,
      {
        method: "POST",
        body: command(fixture.gms[0]!, championship.revision, {
          proposingTeamId: fixture.teams[0]!.uuid,
          receivingTeamId: fixture.teams[1]!.uuid,
          proposingParticipantIds: [fixture.playerParticipants[1]!.uuid],
          receivingParticipantIds: [fixture.playerParticipants[3]!.uuid]
        })
      }
    );
    const secondTrade = await secondProposal.json();
    championship = await getChampionship(championship.uuid);
    const cancellation = await request(
      `/api/championships/${championship.uuid}/trades/${secondTrade.uuid}/cancel`,
      {
        method: "POST",
        body: command(fixture.gms[0]!, championship.revision, {
          expectedTradeRevision: secondTrade.revision,
          reason: "Proposta substituída"
        })
      }
    );

    expect(cancellation.status).toBe(200);
    expect(await cancellation.json()).toMatchObject({ state: "canceled" });
  });
});

describe("championship format and scheduling", () => {
  it("previews a complete double-elimination graph without mutating the championship", async () => {
    const fixture = await createFormatFixture(4);
    const previewResponse = await request(
      `/api/championships/${fixture.championship.uuid}/stages/double-elimination/preview`,
      {
        method: "POST",
        body: {
          actorAccountUuid: admin.uuid,
          teamIds: fixture.teams.map((team) => team.uuid),
          grandFinalReset: true
        }
      }
    );
    const preview = await previewResponse.json();

    expect(previewResponse.status).toBe(200);
    expect(preview).toMatchObject({
      teamCount: 4,
      bracketSize: 4,
      winnersRoundCount: 2,
      losersRoundCount: 2,
      grandFinalReset: true
    });
    expect(preview.matches).toHaveLength(7);
    expect(preview.matches).toContainEqual(
      expect.objectContaining({
        key: "grand-final-reset",
        bracket: "grand-final"
      })
    );
    expect(preview.routes).toContainEqual(
      expect.objectContaining({
        sourceMatchKey: "grand-final-1",
        destinationSpotKey: "grand-final-reset-b",
        condition: "if-side-b-wins"
      })
    );
    expect(await getChampionship(fixture.championship.uuid)).toMatchObject({
      revision: fixture.championship.revision
    });
    const format = await (
      await request(
        `/api/championships/${fixture.championship.uuid}/format?actorAccountUuid=${admin.uuid}`
      )
    ).json();
    expect(format.stages.items).toHaveLength(0);
  });

  it("materializes double elimination with loser drops, reset routes, rounds, and byes", async () => {
    const fixture = await createFormatFixture(5);
    const response = await request(
      `/api/championships/${fixture.championship.uuid}/stages/double-elimination`,
      {
        method: "POST",
        body: command(admin, fixture.championship.revision, {
          name: "Dupla eliminação",
          teamIds: fixture.teams.map((team) => team.uuid),
          grandFinalReset: true,
          createCompetitionRounds: true,
          firstRoundStartsAt: "2026-08-01T18:00:00.000Z",
          roundDurationHours: 24
        })
      }
    );
    const format = await response.json();

    expect(response.status).toBe(200);
    expect(format.stages.items[0]).toMatchObject({
      engine: "double-elimination",
      config: {
        bracketSize: 8,
        teamCount: 5,
        grandFinalReset: true,
        winnersRoundCount: 3,
        losersRoundCount: 4
      }
    });
    expect(format.matches.items).toHaveLength(15);
    expect(format.routes.items.length).toBeGreaterThan(15);
    expect(format.competitionRounds.items.length).toBeGreaterThan(3);
    expect(
      format.matches.items.filter(
        (match: { bracket: string }) => match.bracket === "losers"
      )
    ).not.toHaveLength(0);
    expect(format.matches.items).toContainEqual(
      expect.objectContaining({
        bracket: "grand-final",
        bracketRound: 2,
        matchRulesOverride: {
          conditional: true,
          activationSourceMatchKey: "grand-final-1",
          activationCondition: "if-side-b-wins"
        }
      })
    );
    expect(
      format.matches.items.filter(
        (match: { matchRulesOverride: { automaticBye?: boolean } | null }) =>
          match.matchRulesOverride?.automaticBye
      )
    ).not.toHaveLength(0);
    expect(format.routes.items).toContainEqual(
      expect.objectContaining({
        sourceOutcome: "winner",
        condition: "if-side-a-wins"
      })
    );
    expect(format.routes.items).toContainEqual(
      expect.objectContaining({
        sourceOutcome: "winner",
        condition: "if-side-b-wins"
      })
    );
  });

  it("keeps double-elimination previews staff-only and rejects foreign teams", async () => {
    const fixture = await createFormatFixture(2);
    const other = await createFormatFixture(2);
    const forbidden = await request(
      `/api/championships/${fixture.championship.uuid}/stages/double-elimination/preview`,
      {
        method: "POST",
        body: {
          actorAccountUuid: unprivileged.uuid,
          teamIds: fixture.teams.map((team) => team.uuid),
          grandFinalReset: false
        }
      }
    );
    const foreign = await request(
      `/api/championships/${fixture.championship.uuid}/stages/double-elimination/preview`,
      {
        method: "POST",
        body: {
          actorAccountUuid: admin.uuid,
          teamIds: [fixture.teams[0]!.uuid, other.teams[0]!.uuid],
          grandFinalReset: false
        }
      }
    );

    expect(forbidden.status).toBe(403);
    expect(foreign.status).toBe(400);
  });

  it("materializes a seeded five-team cup with byes, routes, rounds, and inherited program", async () => {
    const program = await createRoomProgram("format-default");
    const fixture = await createFormatFixture(5, {
      roomProgramIds: [program.uuid],
      defaultRoomProgramId: program.uuid
    });
    const response = await request(
      `/api/championships/${fixture.championship.uuid}/stages/single-elimination`,
      {
        method: "POST",
        body: command(admin, fixture.championship.revision, {
          name: "Mata-mata",
          teamIds: fixture.teams.map((team) => team.uuid),
          createCompetitionRounds: true,
          firstRoundStartsAt: "2026-08-01T18:00:00.000Z",
          roundDurationHours: 48
        })
      }
    );

    expect(response.status).toBe(200);
    const format = await response.json();

    expect(format.stages.items).toHaveLength(1);
    expect(format.stages.items[0]).toMatchObject({
      engine: "single-elimination",
      config: {
        bracketSize: 8,
        teamCount: 5,
        seeding: "standard"
      },
      defaultRoomProgram: { uuid: program.uuid }
    });
    expect(format.spots.items).toHaveLength(16);
    expect(format.matches.items).toHaveLength(7);
    expect(format.routes.items).toHaveLength(8);
    expect(format.competitionRounds.items).toHaveLength(3);
    expect(
      format.matches.items.filter(
        (match: { matchRulesOverride: { bye?: boolean } | null }) =>
          match.matchRulesOverride?.bye
      )
    ).toHaveLength(3);
    expect(
      format.matches.items.every(
        (match: { roomProgram: { uuid: string } | null }) =>
          match.roomProgram?.uuid === program.uuid
      )
    ).toBe(true);
    expect(
      format.routes.items.every((route: { destinationSpotUuid: string }) =>
        format.spots.items.some(
          (spot: { uuid: string }) => spot.uuid === route.destinationSpotUuid
        )
      )
    ).toBe(true);

    const boundedResponse = await request(
      `/api/championships/${fixture.championship.uuid}/format?actorAccountUuid=${admin.uuid}&limit=2`
    );
    const boundedFormat = await boundedResponse.json();

    expect(boundedResponse.status).toBe(200);
    expect(boundedFormat.stages).toMatchObject({
      totalCount: 1,
      truncated: false
    });
    expect(boundedFormat.spots).toMatchObject({
      totalCount: 16,
      truncated: true
    });
    expect(boundedFormat.matches).toMatchObject({
      totalCount: 7,
      truncated: true
    });
    expect(boundedFormat.routes).toMatchObject({
      totalCount: 8,
      truncated: true
    });
    expect(boundedFormat.competitionRounds).toMatchObject({
      totalCount: 3,
      truncated: true
    });
    expect(boundedFormat.spots.items).toHaveLength(2);
  });

  it("materializes a pending bracket fed by configurable group ranks", async () => {
    const fixture = await createFormatFixture(4);
    let revision = fixture.championship.revision;
    let format = await successfulJson(
      await request(`/api/championships/${fixture.championship.uuid}/stages`, {
        method: "POST",
        body: command(admin, revision, {
          name: "Fase de grupos",
          engine: "standings"
        })
      })
    );
    revision = format.championshipRevision;
    let groupStage = format.stages.items[0]!;
    const groups = [];

    for (let index = 0; index < 2; index += 1) {
      format = await successfulJson(
        await request(
          `/api/championships/${fixture.championship.uuid}/stages/${groupStage.uuid}/groups`,
          {
            method: "POST",
            body: command(admin, revision, {
              expectedStageRevision: groupStage.revision,
              name: `Grupo ${index + 1}`,
              teamIds: fixture.teams
                .slice(index * 2, index * 2 + 2)
                .map((team) => team.uuid)
            })
          }
        )
      );
      revision = format.championshipRevision;
      groupStage = format.stages.items[0]!;
      groups.push(format.groups.items[index]!);
    }

    const response = await request(
      `/api/championships/${fixture.championship.uuid}/stages/single-elimination`,
      {
        method: "POST",
        body: command(admin, revision, {
          name: "Fase final",
          qualificationSources: [
            { groupId: groups[0].uuid, rank: 1, label: "1º do Grupo 1" },
            { groupId: groups[1].uuid, rank: 2, label: "2º do Grupo 2" },
            { groupId: groups[1].uuid, rank: 1, label: "1º do Grupo 2" },
            { groupId: groups[0].uuid, rank: 2, label: "2º do Grupo 1" }
          ],
          createCompetitionRounds: true
        })
      }
    );

    expect(response.status).toBe(200);
    format = await response.json();
    expect(format.stages.items).toHaveLength(2);
    expect(format.matches.items).toHaveLength(3);
    expect(
      format.routes.items.filter(
        (route: { sourceKind: string }) =>
          route.sourceKind === "classification-rank"
      )
    ).toHaveLength(4);
    expect(
      format.matches.items.every(
        (match: { sideA: { team: unknown }; sideB: { team: unknown } }) =>
          match.sideA.team === null && match.sideB.team === null
      )
    ).toBe(true);
  });

  it("keeps private graphs staff-only and exposes them after publication", async () => {
    const fixture = await createFormatFixture(2);
    let championship = fixture.championship;
    const generated = await request(
      `/api/championships/${championship.uuid}/stages/single-elimination`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          name: "Final",
          teamIds: fixture.teams.map((team) => team.uuid)
        })
      }
    );

    expect(generated.status).toBe(200);
    const privateResponse = await request(
      `/api/championships/${championship.uuid}/format`
    );
    const staffResponse = await request(
      `/api/championships/${championship.uuid}/format?actorAccountUuid=${admin.uuid}&limit=20`
    );

    expect(privateResponse.status).toBe(403);
    expect(staffResponse.status).toBe(200);

    championship = await getChampionship(championship.uuid);
    const publish = await request(
      `/api/championships/${championship.uuid}/transitions`,
      {
        method: "POST",
        body: command(admin, championship.revision, { transition: "publish" })
      }
    );

    expect(publish.status).toBe(200);
    expect(
      (await request(`/api/championships/${championship.uuid}/format?limit=20`))
        .status
    ).toBe(200);
  });

  it("applies a spot override immediately and rejects stale spot editors", async () => {
    const fixture = await createFormatFixture(4);
    const generatedResponse = await request(
      `/api/championships/${fixture.championship.uuid}/stages/single-elimination`,
      {
        method: "POST",
        body: command(admin, fixture.championship.revision, {
          name: "Chave editável",
          teamIds: fixture.teams.map((team) => team.uuid)
        })
      }
    );
    const generated = await generatedResponse.json();
    const spot = generated.spots.items.find(
      (item: { key: string }) => item.key === "r1-m1-a"
    );
    const replacement = fixture.teams[2];
    const previewResponse = await request(
      `/api/championships/${fixture.championship.uuid}/spots/${spot.uuid}/placement-preview`,
      {
        method: "POST",
        body: {
          actorAccountUuid: admin.uuid,
          teamId: replacement.uuid
        }
      }
    );
    expect(previewResponse.status).toBe(200);
    const preview = await previewResponse.json();
    expect(preview).toMatchObject({
      targetSpot: {
        uuid: spot.uuid,
        previousTeam: { uuid: spot.currentTeam.uuid },
        nextTeam: { uuid: replacement.uuid }
      },
      requiresConfirmation: true
    });
    const overrideResponse = await request(
      `/api/championships/${fixture.championship.uuid}/spots/${spot.uuid}/place`,
      {
        method: "POST",
        body: command(admin, generated.championshipRevision, {
          expectedSpotRevision: spot.revision,
          teamId: replacement.uuid,
          confirmedImpactMatchUuids: preview.affectedMatches.map(
            (match: { matchUuid: string }) => match.matchUuid
          ),
          reason: "Correção de chave"
        })
      }
    );

    expect(overrideResponse.status).toBe(200);
    const overridden = await overrideResponse.json();
    const updatedSpot = overridden.spots.items.find(
      (item: { uuid: string }) => item.uuid === spot.uuid
    );
    const affectedMatch = overridden.matches.items.find(
      (match: { sideA: { spotUuid: string } }) =>
        match.sideA.spotUuid === spot.uuid
    );

    expect(updatedSpot.currentTeam.uuid).toBe(replacement.uuid);
    expect(affectedMatch.sideA.team.uuid).toBe(replacement.uuid);

    const staleResponse = await request(
      `/api/championships/${fixture.championship.uuid}/spots/${spot.uuid}/place`,
      {
        method: "POST",
        body: command(admin, overridden.championshipRevision, {
          expectedSpotRevision: spot.revision,
          teamId: null,
          confirmedImpactMatchUuids: []
        })
      }
    );

    expect(staleResponse.status).toBe(409);
    expect(await staleResponse.json()).toMatchObject({
      error: {
        code: "CONFLICT",
        details: {
          currentRevision: spot.revision + 1,
          expectedRevision: spot.revision
        }
      }
    });
  });

  it("previews and atomically invalidates a manual move across a settled bracket", async () => {
    const fixture = await createSettlementFixture(4);
    let championship = fixture.championship;
    const semifinals = fixture.matches
      .filter((match) => match.label.includes("Semifinal"))
      .sort((left, right) => left.displayOrder - right.displayOrder);
    const final = fixture.matches
      .filter((match) => !match.label.includes("Semifinal"))
      .sort((left, right) => left.displayOrder - right.displayOrder)
      .at(-1)!;

    for (const semifinal of semifinals) {
      await settleMatch(championship, semifinal, {
        method: "manual",
        sideAPlayedScore: 2,
        sideBPlayedScore: 1,
        sideAOutcome: "win",
        sideBOutcome: "loss"
      });
      championship = await getChampionship(championship.uuid);
    }

    const physicalFinal = await createCompletedPhysicalMatch({
      red: 3,
      blue: 2
    });
    await attachEvidence(championship, final, physicalFinal.id);
    championship = await getChampionship(championship.uuid);
    await settleMatch(championship, final, {
      method: "played",
      sideAPlayedScore: 3,
      sideBPlayedScore: 2,
      sideAOutcome: "win",
      sideBOutcome: "loss"
    });
    championship = await getChampionship(championship.uuid);

    const format = await successfulJson(
      await request(
        `/api/championships/${championship.uuid}/format?actorAccountUuid=${admin.uuid}&limit=100`
      )
    );
    const semifinalFormats = format.matches.items
      .filter((match: { label: string }) => match.label.includes("Semifinal"))
      .sort(
        (left: { displayOrder: number }, right: { displayOrder: number }) =>
          left.displayOrder - right.displayOrder
      );
    const targetSpot = format.spots.items.find(
      (spot: { uuid: string }) =>
        spot.uuid === semifinalFormats[0].sideA.spotUuid
    );
    const sourceSpot = format.spots.items.find(
      (spot: { uuid: string }) =>
        spot.uuid === semifinalFormats[1].sideA.spotUuid
    );
    const movingTeamUuid = sourceSpot.currentTeam.uuid;
    const preview = await successfulJson(
      await request(
        `/api/championships/${championship.uuid}/spots/${targetSpot.uuid}/placement-preview`,
        {
          method: "POST",
          body: {
            actorAccountUuid: admin.uuid,
            teamId: movingTeamUuid,
            sourceSpotId: sourceSpot.uuid
          }
        }
      )
    );

    expect(preview.affectedMatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          matchUuid: semifinals[0]!.uuid,
          hadResult: true
        }),
        expect.objectContaining({
          matchUuid: semifinals[1]!.uuid,
          hadResult: true
        }),
        expect.objectContaining({
          matchUuid: final.uuid,
          hadResult: true,
          hadEvidence: true
        })
      ])
    );

    const moveResponse = await request(
      `/api/championships/${championship.uuid}/spots/${targetSpot.uuid}/place`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          expectedSpotRevision: targetSpot.revision,
          teamId: movingTeamUuid,
          sourceSpotId: sourceSpot.uuid,
          expectedSourceSpotRevision: sourceSpot.revision,
          confirmedImpactMatchUuids: preview.affectedMatches.map(
            (match: { matchUuid: string }) => match.matchUuid
          ),
          reason: "Correção manual da chave"
        })
      }
    );

    expect(moveResponse.status).toBe(200);
    const moved = await moveResponse.json();
    expect(
      moved.spots.items.find(
        (spot: { uuid: string }) => spot.uuid === targetSpot.uuid
      ).currentTeam.uuid
    ).toBe(movingTeamUuid);
    expect(
      moved.spots.items.find(
        (spot: { uuid: string }) => spot.uuid === sourceSpot.uuid
      ).currentTeam
    ).toBeNull();

    for (const match of [...semifinals, final]) {
      const operations = await successfulJson(
        await request(
          `/api/championships/${championship.uuid}/matches/${match.uuid}?actorAccountUuid=${admin.uuid}`
        )
      );
      expect(operations.result).toBeNull();
      expect(operations.evidence).toBeNull();
    }
  });

  it("builds and schedules a manual graph with explicit spots and routes", async () => {
    const firstProgram = await createRoomProgram("format-manual-default");
    const overrideProgram = await createRoomProgram("format-manual-override");
    const fixture = await createFormatFixture(2, {
      roomProgramIds: [firstProgram.uuid, overrideProgram.uuid],
      defaultRoomProgramId: firstProgram.uuid
    });
    let revision = fixture.championship.revision;
    const stageResponse = await request(
      `/api/championships/${fixture.championship.uuid}/stages`,
      {
        method: "POST",
        body: command(admin, revision, {
          name: "Chave manual",
          engine: "manual"
        })
      }
    );
    const stageFormat = await stageResponse.json();
    revision = stageFormat.championshipRevision;
    const stage = stageFormat.stages.items[0];
    const spots = [];

    for (const [index, team] of fixture.teams.entries()) {
      const spotResponse = await request(
        `/api/championships/${fixture.championship.uuid}/spots`,
        {
          method: "POST",
          body: command(admin, revision, {
            stageId: stage.uuid,
            key: `final-${index}`,
            label: `Final ${index + 1}`,
            kind: "match-side",
            teamId: team.uuid
          })
        }
      );
      const spotFormat = await spotResponse.json();
      revision = spotFormat.championshipRevision;
      spots.push(
        spotFormat.spots.items.find(
          (spot: { key: string }) => spot.key === `final-${index}`
        )
      );
    }

    const winnerSpotResponse = await request(
      `/api/championships/${fixture.championship.uuid}/spots`,
      {
        method: "POST",
        body: command(admin, revision, {
          stageId: stage.uuid,
          key: "winner",
          label: "Campeão",
          kind: "placement",
          placementRank: 1
        })
      }
    );
    let format = await winnerSpotResponse.json();
    revision = format.championshipRevision;
    const winnerSpot = format.spots.items.find(
      (spot: { key: string }) => spot.key === "winner"
    );
    const roundResponse = await request(
      `/api/championships/${fixture.championship.uuid}/competition-rounds`,
      {
        method: "POST",
        body: command(admin, revision, {
          stageId: stage.uuid,
          name: "Dia da final",
          sequence: 1,
          startsAt: "2026-08-08T18:00:00.000Z",
          endsAt: "2026-08-09T03:00:00.000Z"
        })
      }
    );
    format = await roundResponse.json();
    revision = format.championshipRevision;
    const competitionRound = format.competitionRounds.items[0];
    const matchResponse = await request(
      `/api/championships/${fixture.championship.uuid}/championship-matches`,
      {
        method: "POST",
        body: command(admin, revision, {
          stageId: stage.uuid,
          label: "Grande final",
          sideASpotId: spots[0].uuid,
          sideBSpotId: spots[1].uuid,
          competitionRoundId: competitionRound.uuid,
          scheduledAt: "2026-08-08T21:00:00.000Z"
        })
      }
    );
    format = await matchResponse.json();
    revision = format.championshipRevision;
    const match = format.matches.items[0];
    const routeResponse = await request(
      `/api/championships/${fixture.championship.uuid}/progression-routes`,
      {
        method: "POST",
        body: command(admin, revision, {
          sourceKind: "match-outcome",
          sourceMatchId: match.uuid,
          sourceOutcome: "winner",
          destinationSpotId: winnerSpot.uuid
        })
      }
    );
    format = await routeResponse.json();
    revision = format.championshipRevision;
    const scheduleResponse = await request(
      `/api/championships/${fixture.championship.uuid}/championship-matches/${match.uuid}/schedule`,
      {
        method: "PATCH",
        body: command(admin, revision, {
          expectedMatchRevision: match.revision,
          competitionRoundId: competitionRound.uuid,
          scheduledAt: "2026-08-08T22:00:00.000Z",
          scheduleStatus: "scheduled",
          roomProgramId: overrideProgram.uuid
        })
      }
    );

    expect(scheduleResponse.status).toBe(200);
    const scheduled = await scheduleResponse.json();

    expect(scheduled.routes.items).toHaveLength(1);
    expect(scheduled.matches.items[0]).toMatchObject({
      scheduledAt: "2026-08-08T22:00:00.000Z",
      scheduleStatus: "scheduled",
      roomProgram: { uuid: overrideProgram.uuid },
      sideA: { team: { uuid: fixture.teams[0].uuid } },
      sideB: { team: { uuid: fixture.teams[1].uuid } }
    });

    const deleteResponse = await request(
      `/api/championships/${fixture.championship.uuid}/stages/${stage.uuid}`,
      {
        method: "DELETE",
        body: command(admin, scheduled.championshipRevision, {})
      }
    );

    expect(deleteResponse.status).toBe(200);
    const deleted = await deleteResponse.json();
    expect(deleted.stages.items).toHaveLength(0);
    expect(deleted.groups.items).toHaveLength(0);
    expect(deleted.spots.items).toHaveLength(0);
    expect(deleted.matches.items).toHaveLength(0);
    expect(deleted.routes.items).toHaveLength(0);
    expect(deleted.competitionRounds.items).toHaveLength(0);
  });

  it("can place an entire elimination event in one competition period", async () => {
    const fixture = await createFormatFixture(8);
    const response = await request(
      `/api/championships/${fixture.championship.uuid}/stages/single-elimination`,
      {
        method: "POST",
        body: command(admin, fixture.championship.revision, {
          name: "Evento de sábado",
          teamIds: fixture.teams.map((team) => team.uuid),
          createCompetitionRounds: true,
          competitionRoundMode: "single-period",
          firstRoundStartsAt: "2027-02-06T12:00:00.000Z",
          roundDurationHours: 12
        })
      }
    );

    expect(response.status).toBe(200);
    const format = await response.json();
    const periodUuid = format.competitionRounds.items[0]!.uuid;

    expect(format.competitionRounds).toMatchObject({
      totalCount: 1,
      truncated: false,
      items: [
        {
          name: "Evento de sábado",
          startsAt: "2027-02-06T12:00:00.000Z",
          endsAt: "2027-02-07T00:00:00.000Z"
        }
      ]
    });
    expect(format.matches.items).toHaveLength(7);
    expect(
      format.matches.items.every(
        (match: { competitionRoundUuid: string }) =>
          match.competitionRoundUuid === periodUuid
      )
    ).toBe(true);
  });

  it("configures groups, preserves manual schedule control, and atomically applies qualification", async () => {
    const fixture = await createFormatFixture(4);
    let revision = fixture.championship.revision;
    const stageResponse = await request(
      `/api/championships/${fixture.championship.uuid}/stages`,
      {
        method: "POST",
        body: command(admin, revision, {
          name: "Fase classificatória",
          engine: "standings"
        })
      }
    );
    let format = await successfulJson(stageResponse);
    revision = format.championshipRevision;
    let standingsStage = format.stages.items[0]!;
    const groupResponse = await request(
      `/api/championships/${fixture.championship.uuid}/stages/${standingsStage.uuid}/groups`,
      {
        method: "POST",
        body: command(admin, revision, {
          expectedStageRevision: standingsStage.revision,
          name: "Grupo único",
          teamIds: fixture.teams.map((team) => team.uuid)
        })
      }
    );
    format = await successfulJson(groupResponse);
    revision = format.championshipRevision;
    standingsStage = format.stages.items[0]!;
    const group = format.groups.items[0]!;

    expect(format.groups).toMatchObject({
      totalCount: 1,
      truncated: false
    });
    expect(
      format.spots.items.filter(
        (spot: { kind: string }) => spot.kind === "group-entry"
      )
    ).toHaveLength(4);

    const rulesResponse = await request(
      `/api/championships/${fixture.championship.uuid}/stages/${standingsStage.uuid}/standings-rules`,
      {
        method: "PUT",
        body: command(admin, revision, {
          expectedStageRevision: standingsStage.revision,
          scoring: { win: 3, draw: 1, loss: 0 },
          headToHeadRestart: "restart-for-subgroup",
          rules: [
            { criterion: "points", direction: "desc" },
            {
              criterion: "manual",
              direction: "asc",
              config: {
                teamOrder: fixture.teams.map((team) => team.uuid)
              }
            }
          ]
        })
      }
    );
    format = await successfulJson(rulesResponse);
    revision = format.championshipRevision;
    standingsStage = format.stages.items[0]!;
    const previewScheduleResponse = await request(
      `/api/championships/${fixture.championship.uuid}/stages/${standingsStage.uuid}/round-robin/preview`,
      {
        method: "POST",
        body: {
          actorAccountUuid: admin.uuid,
          sameGroupMeetings: 2,
          crossGroupMeetings: 0,
          assignCompetitionRounds: false
        }
      }
    );
    const schedulePreview = await successfulJson(previewScheduleResponse);

    expect(schedulePreview).toMatchObject({
      desiredMatchCount: 12,
      existingMatchCount: 0,
      missingMatchCount: 12,
      excessMatchCount: 0
    });
    expect(
      schedulePreview.pairings.items.every(
        (pairing: { competitionRoundUuid: string | null }) =>
          pairing.competitionRoundUuid === null
      )
    ).toBe(true);

    const generateResponse = await request(
      `/api/championships/${fixture.championship.uuid}/stages/${standingsStage.uuid}/round-robin`,
      {
        method: "POST",
        body: command(admin, revision, {
          expectedStageRevision: standingsStage.revision,
          sameGroupMeetings: 2,
          crossGroupMeetings: 0,
          assignCompetitionRounds: false
        })
      }
    );
    format = await successfulJson(generateResponse);
    revision = format.championshipRevision;
    expect(format.matches.items).toHaveLength(12);
    expect(
      format.matches.items.every(
        (match: { scheduledAt: string | null }) => match.scheduledAt === null
      )
    ).toBe(true);

    const downstreamStageResponse = await request(
      `/api/championships/${fixture.championship.uuid}/stages`,
      {
        method: "POST",
        body: command(admin, revision, {
          name: "Fase final",
          engine: "manual"
        })
      }
    );
    format = await successfulJson(downstreamStageResponse);
    revision = format.championshipRevision;
    const downstreamStage = format.stages.items.find(
      (stage: { name: string }) => stage.name === "Fase final"
    )!;
    const destinationSpots = [];

    for (const [index, team] of fixture.teams.slice(2).entries()) {
      const spotResponse = await request(
        `/api/championships/${fixture.championship.uuid}/spots`,
        {
          method: "POST",
          body: command(admin, revision, {
            stageId: downstreamStage.uuid,
            key: `qualified-${index + 1}`,
            label: `Classificado ${index + 1}`,
            kind: "qualification",
            teamId: team.uuid
          })
        }
      );
      format = await successfulJson(spotResponse);
      revision = format.championshipRevision;
      destinationSpots.push(
        format.spots.items.find(
          (spot: { key: string }) => spot.key === `qualified-${index + 1}`
        )
      );
    }

    const finalResponse = await request(
      `/api/championships/${fixture.championship.uuid}/championship-matches`,
      {
        method: "POST",
        body: command(admin, revision, {
          stageId: downstreamStage.uuid,
          label: "Final já registrada",
          sideASpotId: destinationSpots[0].uuid,
          sideBSpotId: destinationSpots[1].uuid
        })
      }
    );
    format = await successfulJson(finalResponse);
    revision = format.championshipRevision;
    const finalMatch = format.matches.items.find(
      (match: { label: string }) => match.label === "Final já registrada"
    )!;
    await settleMatch(fixture.championship, finalMatch, {
      method: "manual",
      sideAPlayedScore: 2,
      sideBPlayedScore: 1,
      sideAOutcome: "win",
      sideBOutcome: "loss"
    });
    revision = (await getChampionship(fixture.championship.uuid)).revision;

    for (const [index, destination] of destinationSpots.entries()) {
      const routeResponse = await request(
        `/api/championships/${fixture.championship.uuid}/progression-routes`,
        {
          method: "POST",
          body: command(admin, revision, {
            sourceKind: "classification-rank",
            sourceGroupId: group.uuid,
            sourceOutcome: "rank",
            sourceRank: index + 1,
            destinationSpotId: destination.uuid
          })
        }
      );
      format = await successfulJson(routeResponse);
      revision = format.championshipRevision;
    }

    const classificationPath =
      `/api/championships/${fixture.championship.uuid}` +
      `/stages/${standingsStage.uuid}/groups/${group.uuid}/classification`;
    const previewResponse = await request(`${classificationPath}/preview`, {
      method: "POST",
      body: { actorAccountUuid: admin.uuid }
    });
    const classification = await successfulJson(previewResponse);

    expect(
      classification.rows
        .slice(0, 2)
        .map((row: { team: { uuid: string } }) => row.team.uuid)
    ).toEqual(fixture.teams.slice(0, 2).map((team) => team.uuid));
    expect(classification.qualification).toMatchObject([
      {
        rank: 1,
        changed: true,
        blocked: false,
        nextTeam: { uuid: fixture.teams[0]!.uuid }
      },
      {
        rank: 2,
        changed: true,
        blocked: false,
        nextTeam: { uuid: fixture.teams[1]!.uuid }
      }
    ]);
    expect(classification.affectedMatches).toEqual([
      expect.objectContaining({
        matchUuid: finalMatch.uuid,
        hadResult: true
      })
    ]);

    const unconfirmedResponse = await request(`${classificationPath}/apply`, {
      method: "POST",
      body: command(admin, revision, {
        expectedStageRevision: classification.stage.revision,
        confirmedImpactMatchUuids: []
      })
    });
    expect(unconfirmedResponse.status).toBe(409);
    expect((await getChampionship(fixture.championship.uuid)).revision).toBe(
      revision
    );

    const applyResponse = await request(`${classificationPath}/apply`, {
      method: "POST",
      body: command(admin, revision, {
        expectedStageRevision: classification.stage.revision,
        confirmedImpactMatchUuids: [finalMatch.uuid]
      })
    });
    const applied = await successfulJson(applyResponse);

    expect(applied.latestRun).toMatchObject({ status: "resolved" });
    const finalOperations = await successfulJson(
      await request(
        `/api/championships/${fixture.championship.uuid}/matches/${finalMatch.uuid}?actorAccountUuid=${admin.uuid}`
      )
    );
    expect(finalOperations.result).toBeNull();
    expect(finalOperations.evidence).toBeNull();

    format = await successfulJson(
      await request(
        `/api/championships/${fixture.championship.uuid}/format?actorAccountUuid=${admin.uuid}`
      )
    );
    expect(
      destinationSpots.map(
        (destination: { uuid: string }) =>
          format.spots.items.find(
            (spot: { uuid: string }) => spot.uuid === destination.uuid
          ).currentTeam.uuid
      )
    ).toEqual(fixture.teams.slice(0, 2).map((team) => team.uuid));
  });

  it("blocks a routed rank inside an unresolved standings tie", async () => {
    const fixture = await createFormatFixture(2);
    let revision = fixture.championship.revision;
    let format = await successfulJson(
      await request(`/api/championships/${fixture.championship.uuid}/stages`, {
        method: "POST",
        body: command(admin, revision, {
          name: "Tabela empatada",
          engine: "standings"
        })
      })
    );
    revision = format.championshipRevision;
    let stage = format.stages.items[0]!;
    format = await successfulJson(
      await request(
        `/api/championships/${fixture.championship.uuid}/stages/${stage.uuid}/groups`,
        {
          method: "POST",
          body: command(admin, revision, {
            expectedStageRevision: stage.revision,
            name: "Grupo empatado",
            teamIds: fixture.teams.map((team) => team.uuid)
          })
        }
      )
    );
    revision = format.championshipRevision;
    stage = format.stages.items[0]!;
    const group = format.groups.items[0]!;
    format = await successfulJson(
      await request(
        `/api/championships/${fixture.championship.uuid}/stages/${stage.uuid}/standings-rules`,
        {
          method: "PUT",
          body: command(admin, revision, {
            expectedStageRevision: stage.revision,
            scoring: { win: 3, draw: 1, loss: 0 },
            headToHeadRestart: "continue",
            rules: [{ criterion: "points", direction: "desc" }]
          })
        }
      )
    );
    revision = format.championshipRevision;
    format = await successfulJson(
      await request(`/api/championships/${fixture.championship.uuid}/stages`, {
        method: "POST",
        body: command(admin, revision, {
          name: "Destino",
          engine: "manual"
        })
      })
    );
    revision = format.championshipRevision;
    const destinationStage = format.stages.items.find(
      (candidate: { name: string }) => candidate.name === "Destino"
    )!;
    format = await successfulJson(
      await request(`/api/championships/${fixture.championship.uuid}/spots`, {
        method: "POST",
        body: command(admin, revision, {
          stageId: destinationStage.uuid,
          key: "unresolved-winner",
          label: "Vencedor do grupo",
          kind: "qualification"
        })
      })
    );
    revision = format.championshipRevision;
    const destination = format.spots.items.find(
      (spot: { key: string }) => spot.key === "unresolved-winner"
    )!;
    format = await successfulJson(
      await request(
        `/api/championships/${fixture.championship.uuid}/progression-routes`,
        {
          method: "POST",
          body: command(admin, revision, {
            sourceKind: "classification-rank",
            sourceGroupId: group.uuid,
            sourceOutcome: "rank",
            sourceRank: 1,
            destinationSpotId: destination.uuid
          })
        }
      )
    );
    revision = format.championshipRevision;
    const classificationPath =
      `/api/championships/${fixture.championship.uuid}` +
      `/stages/${stage.uuid}/groups/${group.uuid}/classification`;
    const preview = await successfulJson(
      await request(`${classificationPath}/preview`, {
        method: "POST",
        body: { actorAccountUuid: admin.uuid }
      })
    );

    expect(preview.canApply).toBe(false);
    expect(preview.unresolvedTies).toHaveLength(1);
    expect(preview.qualification).toEqual([
      expect.objectContaining({
        rank: 1,
        blocked: true
      })
    ]);
    const applyResponse = await request(`${classificationPath}/apply`, {
      method: "POST",
      body: command(admin, revision, {
        expectedStageRevision: preview.stage.revision,
        confirmedImpactMatchUuids: []
      })
    });

    expect(applyResponse.status).toBe(409);
  });
});

describe("championship scheduling negotiations", () => {
  it("keeps proposals private and lets opposing GMs counter and confirm", async () => {
    const fixture = await createSchedulingFixture();
    const match = fixture.format.matches.items[0]!;
    const schedulingPath =
      `/api/championships/${fixture.championship.uuid}` +
      `/championship-matches/${match.uuid}/scheduling`;
    const unrelatedResponse = await request(
      `${schedulingPath}?actorAccountUuid=${unprivileged.uuid}`
    );

    expect(unrelatedResponse.status).toBe(403);

    const initialResponse = await request(
      `${schedulingPath}?actorAccountUuid=${fixture.gms[0]!.uuid}`
    );
    expect(initialResponse.status).toBe(200);
    const initial = await initialResponse.json();

    expect(initial).toMatchObject({
      actor: {
        access: "gm",
        team: { uuid: fixture.teams[0]!.uuid },
        canPropose: true,
        canIntervene: false
      },
      match: {
        scheduleStatus: "unscheduled",
        scheduleRevision: 0
      },
      proposals: { items: [], total: 0, truncated: false }
    });

    const firstResponse = await request(
      `/api/championships/${fixture.championship.uuid}` +
        `/championship-matches/${match.uuid}/schedule-proposals`,
      {
        method: "POST",
        body: command(fixture.gms[0]!, initial.championshipRevision, {
          expectedMatchScheduleRevision: 0,
          mode: "exact-time",
          exactTime: "2027-01-01T21:00:00.000Z",
          note: "Primeiro horário"
        })
      }
    );

    expect(firstResponse.status).toBe(200);
    const first = await firstResponse.json();
    const firstProposal = first.proposals.items[0]!;

    expect(first).toMatchObject({
      match: { scheduleStatus: "proposed", scheduleRevision: 1 },
      proposals: {
        total: 1,
        items: [
          {
            state: "pending",
            mode: "exact-time",
            exactTime: "2027-01-01T21:00:00.000Z",
            proposingTeam: { uuid: fixture.teams[0]!.uuid }
          }
        ]
      }
    });

    const ownAcceptance = await request(
      `/api/championships/${fixture.championship.uuid}` +
        `/championship-matches/${match.uuid}/schedule-proposals/` +
        `${firstProposal.uuid}/decision`,
      {
        method: "POST",
        body: command(fixture.gms[0]!, first.championshipRevision, {
          expectedMatchScheduleRevision: 1,
          expectedProposalRevision: 0,
          decision: "accept"
        })
      }
    );

    expect(ownAcceptance.status).toBe(403);

    const counterResponse = await request(
      `/api/championships/${fixture.championship.uuid}` +
        `/championship-matches/${match.uuid}/schedule-proposals`,
      {
        method: "POST",
        body: command(fixture.gms[1]!, first.championshipRevision, {
          expectedMatchScheduleRevision: 1,
          parentProposalId: firstProposal.uuid,
          expectedParentProposalRevision: 0,
          mode: "availability-range",
          availableFrom: "2027-01-01T22:00:00.000Z",
          availableTo: "2027-01-02T00:00:00.000Z",
          note: "Podemos nesta faixa"
        })
      }
    );

    expect(counterResponse.status).toBe(200);
    const countered = await counterResponse.json();
    const counterProposal = countered.proposals.items[1]!;

    expect(countered).toMatchObject({
      match: { scheduleRevision: 2 },
      proposals: {
        total: 2,
        items: [
          { uuid: firstProposal.uuid, state: "countered", revision: 1 },
          {
            state: "pending",
            parentProposalUuid: firstProposal.uuid,
            mode: "availability-range"
          }
        ]
      }
    });

    const acceptResponse = await request(
      `/api/championships/${fixture.championship.uuid}` +
        `/championship-matches/${match.uuid}/schedule-proposals/` +
        `${counterProposal.uuid}/decision`,
      {
        method: "POST",
        body: command(fixture.gms[0]!, countered.championshipRevision, {
          expectedMatchScheduleRevision: 2,
          expectedProposalRevision: 0,
          decision: "accept",
          scheduledAt: "2027-01-01T23:00:00.000Z"
        })
      }
    );

    expect(acceptResponse.status).toBe(200);
    const accepted = await acceptResponse.json();

    expect(accepted).toMatchObject({
      match: {
        scheduledAt: "2027-01-01T23:00:00.000Z",
        scheduleStatus: "scheduled",
        scheduleRevision: 3
      },
      proposals: {
        items: [
          { state: "countered" },
          { uuid: counterProposal.uuid, state: "accepted", revision: 1 }
        ]
      }
    });

    const format = await (
      await request(
        `/api/championships/${fixture.championship.uuid}/format?` +
          `actorAccountUuid=${admin.uuid}`
      )
    ).json();
    expect(format.matches.items[0]).toMatchObject({
      scheduledAt: "2027-01-01T23:00:00.000Z",
      scheduleStatus: "scheduled"
    });
    expect(format.proposals).toBeUndefined();

    const reminderResponse = await request(
      `/api/championships/${fixture.championship.uuid}` +
        `/championship-matches/${match.uuid}/schedule-reminders`,
      {
        method: "POST",
        body: command(fixture.gms[0]!, accepted.championshipRevision, {
          note: "Confirmem a sala, por favor."
        })
      }
    );
    expect(reminderResponse.status).toBe(200);

    const inbox = await paginatedItems<{ kind: string; contextUuid: string }>(
      await request(
        `/api/championships/inbox?actorAccountUuid=${fixture.gms[1]!.uuid}` +
          `&unreadOnly=true&limit=100`
      )
    );
    expect(inbox).toContainEqual(
      expect.objectContaining({
        kind: "schedule",
        contextUuid: match.uuid
      })
    );
  });

  it("requires staff approval before accepting a late schedule", async () => {
    const fixture = await createSchedulingFixture();
    const match = fixture.format.matches.items[0]!;
    const proposalResponse = await request(
      `/api/championships/${fixture.championship.uuid}` +
        `/championship-matches/${match.uuid}/schedule-proposals`,
      {
        method: "POST",
        body: command(fixture.gms[0]!, fixture.format.championshipRevision, {
          expectedMatchScheduleRevision: 0,
          mode: "exact-time",
          exactTime: "2027-01-03T21:00:00.000Z"
        })
      }
    );
    const proposed = await proposalResponse.json();
    const proposal = proposed.proposals.items[0]!;
    const blockedResponse = await request(
      `/api/championships/${fixture.championship.uuid}` +
        `/championship-matches/${match.uuid}/schedule-proposals/` +
        `${proposal.uuid}/decision`,
      {
        method: "POST",
        body: command(fixture.gms[1]!, proposed.championshipRevision, {
          expectedMatchScheduleRevision: 1,
          expectedProposalRevision: 0,
          decision: "accept"
        })
      }
    );

    expect(blockedResponse.status).toBe(403);
    expect(await blockedResponse.json()).toMatchObject({
      error: {
        code: "FORBIDDEN",
        message: "Late play requires an active staff authorization"
      }
    });

    const authorizationResponse = await request(
      `/api/championships/${fixture.championship.uuid}` +
        `/championship-matches/${match.uuid}/late-play-authorizations`,
      {
        method: "POST",
        body: command(admin, proposed.championshipRevision, {
          expectedMatchScheduleRevision: 1,
          reason: "Exceção aprovada pela organização",
          expiresAt: "2027-01-04T00:00:00.000Z"
        })
      }
    );

    expect(authorizationResponse.status).toBe(200);
    const authorized = await authorizationResponse.json();
    expect(authorized).toMatchObject({
      match: { scheduleRevision: 2 },
      lateAuthorizations: {
        total: 1,
        items: [
          {
            reason: "Exceção aprovada pela organização",
            active: true,
            revision: 0
          }
        ]
      }
    });

    const acceptedResponse = await request(
      `/api/championships/${fixture.championship.uuid}` +
        `/championship-matches/${match.uuid}/schedule-proposals/` +
        `${proposal.uuid}/decision`,
      {
        method: "POST",
        body: command(fixture.gms[1]!, authorized.championshipRevision, {
          expectedMatchScheduleRevision: 2,
          expectedProposalRevision: 0,
          decision: "accept"
        })
      }
    );

    expect(acceptedResponse.status).toBe(200);
    expect(await acceptedResponse.json()).toMatchObject({
      match: {
        scheduledAt: "2027-01-03T21:00:00.000Z",
        scheduleStatus: "late-authorized",
        scheduleRevision: 3
      }
    });
  });
});

describe("championship match evidence and settlement", () => {
  it("accepts evidence from any active championship room program", async () => {
    const defaultProgram = await createRoomProgram("settlement-default");
    const alternateProgram = await createRoomProgram("settlement-alternate");
    const fixture = await createSettlementFixture(2, {
      roomProgramIds: [defaultProgram.uuid, alternateProgram.uuid],
      defaultRoomProgramId: defaultProgram.uuid
    });
    const roomId = createTestRoomInstance(alternateProgram.uuid);
    const physicalMatch = await createCompletedPhysicalMatch(
      { red: 2, blue: 1 },
      { roomId }
    );
    const candidates = await successfulJson(
      await request(
        `/api/championships/${fixture.championship.uuid}/matches/${fixture.matches[0].uuid}/evidence-candidates?actorAccountUuid=${admin.uuid}&logicalMatchId=${physicalMatch.id}`
      )
    );

    expect(candidates.items).toContainEqual(
      expect.objectContaining({
        programCompatible: true,
        expectedProgram: expect.objectContaining({ uuid: defaultProgram.uuid })
      })
    );

    await attachEvidence(
      fixture.championship,
      fixture.matches[0],
      physicalMatch.id
    );
    const preview = await successfulJson(
      await request(
        `/api/championships/${fixture.championship.uuid}/matches/${fixture.matches[0].uuid}/settlement-previews`,
        {
          method: "POST",
          body: {
            actorAccountUuid: admin.uuid,
            ...settlementDraft({
              method: "played",
              sideAPlayedScore: 2,
              sideBPlayedScore: 1,
              sideAOutcome: "win",
              sideBOutcome: "loss"
            }),
            evidenceQualityReviewed: true
          }
        }
      )
    );

    expect(preview.findings).not.toContainEqual(
      expect.objectContaining({ code: "program-mismatch" })
    );
  });

  it("finds evidence by formatted and partial logical match codes", async () => {
    const physicalMatch = await createCompletedPhysicalMatch({
      red: 3,
      blue: 1
    });
    const fixture = await createSettlementFixture(2);
    const formattedCode =
      `${physicalMatch.id.slice(0, 4)}-${physicalMatch.id.slice(4)}`.toUpperCase();

    for (const search of [
      formattedCode,
      physicalMatch.id.slice(0, 7).toUpperCase()
    ]) {
      const response = await successfulJson(
        await request(
          `/api/championships/${fixture.championship.uuid}/matches/${fixture.matches[0].uuid}/evidence-candidates` +
            `?actorAccountUuid=${admin.uuid}&playerSearch=${encodeURIComponent(search)}`
        )
      );

      expect(response.items).toContainEqual(
        expect.objectContaining({
          evidence: expect.objectContaining({ id: physicalMatch.id })
        })
      );
    }
  });

  it("composes and attaches independent room games in one championship command", async () => {
    const firstHalf = await createCompletedPhysicalMatch({ red: 3, blue: 1 });
    const secondHalf = await createCompletedPhysicalMatch({ red: 2, blue: 4 });
    const fixture = await createSettlementFixture(2);
    const candidateResponse = await successfulJson(
      await request(
        `/api/championships/${fixture.championship.uuid}/matches/${fixture.matches[0].uuid}/evidence-candidates?actorAccountUuid=${admin.uuid}&logicalMatchId=${firstHalf.id}`
      )
    );
    expect(candidateResponse.items).toContainEqual(
      expect.objectContaining({
        championshipContext: "untagged",
        evidence: expect.objectContaining({ id: firstHalf.id })
      })
    );
    const response = await request(
      `/api/championships/${fixture.championship.uuid}/matches/${fixture.matches[0].uuid}/evidence`,
      {
        method: "PUT",
        body: command(admin, fixture.championship.revision, {
          expectedEvidenceRevision: 0,
          composition: {
            rounds: [
              {
                kind: "sequential",
                number: 1,
                matchId: firstHalf.id,
                orientation: "aligned"
              },
              {
                kind: "sequential",
                number: 2,
                matchId: secondHalf.id,
                orientation: "swapped"
              }
            ]
          },
          orientation: "aligned",
          note: "Tempos associados manualmente no painel"
        })
      }
    );

    expect(response.status).toBe(200);
    const operations = await response.json();

    expect(operations.evidence).toMatchObject({
      kind: "composed",
      scoreMode: "per-game",
      score: { red: 7, blue: 3 },
      claim: {
        consumerKind: "championship-match",
        consumerUuid: fixture.matches[0].uuid
      },
      rounds: [
        {
          matchId: firstHalf.id,
          orientation: "aligned",
          normalizedScore: { red: 3, blue: 1 }
        },
        {
          matchId: secondHalf.id,
          orientation: "swapped",
          normalizedScore: { red: 4, blue: 2 }
        }
      ]
    });
    expect(operations.evidence.id).toMatch(/^c[a-z2-9]{8}$/);

    const correctScorePreview = await (
      await request(
        `/api/championships/${fixture.championship.uuid}/matches/${fixture.matches[0].uuid}/settlement-previews`,
        {
          method: "POST",
          body: {
            actorAccountUuid: admin.uuid,
            ...settlementDraft({
              method: "played",
              sideAPlayedScore: 7,
              sideBPlayedScore: 3,
              sideAOutcome: "win",
              sideBOutcome: "loss"
            }),
            evidenceQualityReviewed: true
          }
        }
      )
    ).json();
    const wrongScorePreview = await (
      await request(
        `/api/championships/${fixture.championship.uuid}/matches/${fixture.matches[0].uuid}/settlement-previews`,
        {
          method: "POST",
          body: {
            actorAccountUuid: admin.uuid,
            ...settlementDraft({
              method: "played",
              sideAPlayedScore: 4,
              sideBPlayedScore: 2,
              sideAOutcome: "win",
              sideBOutcome: "loss"
            }),
            evidenceQualityReviewed: true
          }
        }
      )
    ).json();

    expect(correctScorePreview.findings).not.toContainEqual(
      expect.objectContaining({ code: "played-score-mismatch" })
    );
    expect(wrongScorePreview.findings).toContainEqual(
      expect.objectContaining({
        code: "played-score-mismatch",
        severity: "blocking"
      })
    );
  });

  it("normalizes a switched-side two-half game and claims every physical half atomically", async () => {
    const firstHalf = await createCompletedPhysicalMatch({ red: 2, blue: 1 });
    const secondHalf = await createCompletedPhysicalMatch({ red: 2, blue: 4 });
    const composition = await createMatchComposition([
      {
        kind: "sequential",
        number: 1,
        matchId: firstHalf.id,
        orientation: "aligned"
      },
      {
        kind: "sequential",
        number: 2,
        matchId: secondHalf.id,
        orientation: "swapped"
      }
    ]);
    const evidenceResponse = await request(
      `/api/matches/${composition.id}/evidence`
    );
    const evidence = await evidenceResponse.json();

    expect(evidenceResponse.status).toBe(200);
    expect(evidence).toMatchObject({
      kind: "composed",
      id: composition.id,
      eligible: true,
      quality: "legacy",
      score: { red: 4, blue: 2 },
      rounds: [
        {
          position: 1,
          orientation: "aligned",
          normalizedScore: { red: 2, blue: 1 }
        },
        {
          position: 2,
          orientation: "swapped",
          normalizedScore: { red: 4, blue: 2 }
        }
      ]
    });

    const fixture = await createSettlementFixture(2);
    const attached = await attachEvidence(
      fixture.championship,
      fixture.matches[0],
      composition.id
    );

    expect(attached.evidence).toMatchObject({
      id: composition.id,
      claim: {
        consumerKind: "championship-match",
        consumerUuid: fixture.matches[0].uuid
      }
    });
    expect(attached.evidenceOrientation).toBe("aligned");

    const secondFixture = await createSettlementFixture(2);
    const duplicateResponse = await request(
      `/api/championships/${secondFixture.championship.uuid}/matches/${secondFixture.matches[0].uuid}/evidence`,
      {
        method: "PUT",
        body: command(admin, secondFixture.championship.revision, {
          expectedEvidenceRevision: 0,
          logicalMatchId: composition.id,
          orientation: "aligned"
        })
      }
    );

    expect(duplicateResponse.status).toBe(409);

    const compositionEdit = await request(
      `/api/matches/${composition.id}/rounds`,
      {
        method: "PUT",
        body: {
          rounds: [
            {
              kind: "sequential",
              number: 1,
              matchId: firstHalf.id,
              orientation: "aligned"
            },
            {
              kind: "sequential",
              number: 2,
              matchId: secondHalf.id,
              orientation: "swapped"
            }
          ]
        }
      }
    );

    expect(compositionEdit.status).toBe(409);

    const currentChampionship = await getChampionship(
      fixture.championship.uuid
    );
    const detachResponse = await request(
      `/api/championships/${fixture.championship.uuid}/matches/${fixture.matches[0].uuid}/evidence`,
      {
        method: "DELETE",
        body: command(admin, currentChampionship.revision, {
          expectedEvidenceRevision: 1,
          reason: "Evidência selecionada por engano"
        })
      }
    );

    expect(detachResponse.status).toBe(200);
    expect((await detachResponse.json()).evidence).toBeNull();
    expect(
      (await request(`/api/matches/${composition.id}/evidence`)).status
    ).toBe(200);
    expect(
      await (await request(`/api/matches/${composition.id}/evidence`)).json()
    ).toMatchObject({ claim: null });
  });

  for (const scenario of [
    {
      name: "uses the configured score for a full forfeit",
      draft: {
        method: "full-forfeit",
        sideAPlayedScore: 99,
        sideBPlayedScore: 88,
        sideAOutcome: "win",
        sideBOutcome: "loss"
      },
      expected: {
        method: "full-forfeit",
        sideAPlayedScore: 3,
        sideBPlayedScore: 0,
        sideAOfficialScore: 3,
        sideBOfficialScore: 0,
        sideAOutcome: "win",
        sideBOutcome: "loss"
      }
    },
    {
      name: "records a double forfeit as a scoreless loss for both teams",
      draft: {
        method: "double-forfeit",
        sideAPlayedScore: 4,
        sideBPlayedScore: 2,
        sideAOutcome: "loss",
        sideBOutcome: "loss"
      },
      expected: {
        method: "double-forfeit",
        sideAOfficialScore: 0,
        sideBOfficialScore: 0,
        sideAOutcome: "loss",
        sideBOutcome: "loss"
      }
    },
    {
      name: "settles a match manually without room evidence",
      draft: {
        method: "manual",
        sideAPlayedScore: 5,
        sideBPlayedScore: 4,
        sideAOutcome: "win",
        sideBOutcome: "loss",
        note: "Súmula informada pela organização"
      },
      expected: {
        method: "manual",
        sideAOfficialScore: 5,
        sideBOfficialScore: 4,
        sideAOutcome: "win",
        sideBOutcome: "loss"
      }
    },
    {
      name: "keeps explicit victory independent from a mid-game forfeit score",
      draft: {
        method: "mid-game-forfeit",
        sideAPlayedScore: 1,
        sideBPlayedScore: 4,
        sideAAdministrativeScore: 2,
        sideAOutcome: "win",
        sideBOutcome: "loss"
      },
      evidenceScore: { red: 1, blue: 4 },
      expected: {
        method: "mid-game-forfeit",
        sideAPlayedScore: 1,
        sideBPlayedScore: 4,
        sideAAdministrativeScore: 2,
        sideAOfficialScore: 3,
        sideBOfficialScore: 4,
        sideAOutcome: "win",
        sideBOutcome: "loss"
      }
    }
  ] as const) {
    it(scenario.name, async () => {
      const fixture = await createSettlementFixture(2);
      let championship = fixture.championship;

      if ("evidenceScore" in scenario) {
        const physicalMatch = await createCompletedPhysicalMatch(
          scenario.evidenceScore!
        );
        await attachEvidence(
          championship,
          fixture.matches[0],
          physicalMatch.id
        );
        championship = await getChampionship(championship.uuid);
      }

      const settled = await settleMatch(
        championship,
        fixture.matches[0],
        scenario.draft
      );

      expect(settled.result).toMatchObject(scenario.expected);
      expect(settled.match.scheduleStatus).toBe("played");

      const statistics = await successfulJson(
        await request(
          `/api/championships/${championship.uuid}/statistics?actorAccountUuid=${admin.uuid}`
        )
      );
      const sideA = statistics.teams.items.find(
        ({ team }: { team: { uuid: string } }) =>
          team.uuid === fixture.teams[0].uuid
      );

      expect(sideA).toMatchObject({
        played: 1,
        pointsFor: scenario.expected.sideAOfficialScore,
        wins: scenario.expected.sideAOutcome === "win" ? 1 : 0,
        losses: scenario.expected.sideAOutcome === "loss" ? 1 : 0
      });
    });
  }

  it("hides pending evidence publicly and publishes it with the accepted result", async () => {
    const fixture = await createSettlementFixture(2, { publish: true });
    const physicalMatch = await createCompletedPhysicalMatch({
      red: 2,
      blue: 1
    });
    await attachEvidence(
      fixture.championship,
      fixture.matches[0],
      physicalMatch.id
    );
    let championship = await getChampionship(fixture.championship.uuid);
    const pending = await (
      await request(
        `/api/championships/${championship.uuid}/matches/${fixture.matches[0].uuid}`
      )
    ).json();

    expect(pending.evidence).toBeNull();
    expect(pending.result).toBeNull();

    await settleMatch(championship, fixture.matches[0], {
      method: "played",
      sideAPlayedScore: 2,
      sideBPlayedScore: 1,
      sideAOutcome: "win",
      sideBOutcome: "loss"
    });
    championship = await getChampionship(championship.uuid);
    const published = await (
      await request(
        `/api/championships/${championship.uuid}/matches/${fixture.matches[0].uuid}`
      )
    ).json();

    expect(published.evidence).toMatchObject({ id: physicalMatch.id });
    expect(published.result).toMatchObject({
      sideAOfficialScore: 2,
      sideBOfficialScore: 1
    });
  });

  it("redirects participation and playing time, then preserves the appearance when evidence is detached", async () => {
    const targetAccount = await createAccountWithPermissions([]);
    const sourcePlayer = await createPlayer("Convidado oficial");
    const fixture = await createSettlementFixture(2);
    let championship = fixture.championship;
    const open = await request(
      `/api/championships/${championship.uuid}/registration/transitions`,
      {
        method: "POST",
        body: command(admin, championship.revision, { operation: "open" })
      }
    );

    expect(open.status).toBe(200);
    championship = await open.json();
    const registration = await request(
      `/api/championships/${championship.uuid}/registrations/self`,
      {
        method: "POST",
        body: command(targetAccount, championship.revision, {})
      }
    );

    expect(registration.status).toBe(201);
    const targetParticipant = await registration.json();
    championship = await getChampionship(championship.uuid);
    const physicalMatch = await createCompletedPhysicalMatch(
      { red: 3, blue: 1 },
      {
        events: [
          {
            type: MATCH_ROOM_EVENT.PlayerTeamChange,
            domain: "room",
            scope: "player",
            actorPlayerId: sourcePlayer.id,
            value: {},
            team: "red",
            occurredAt: "2026-09-01T20:00:00.000Z",
            elapsedSeconds: 0
          },
          {
            type: MATCH_ROOM_EVENT.PlayerLeave,
            domain: "room",
            scope: "player",
            actorPlayerId: sourcePlayer.id,
            value: {},
            occurredAt: "2026-09-01T20:10:00.000Z",
            elapsedSeconds: 600
          }
        ]
      }
    );
    await attachEvidence(championship, fixture.matches[0], physicalMatch.id);
    championship = await getChampionship(championship.uuid);
    const settled = await settleMatch(championship, fixture.matches[0], {
      method: "played",
      sideAPlayedScore: 3,
      sideBPlayedScore: 1,
      sideAOutcome: "win",
      sideBOutcome: "loss",
      attributions: [
        {
          sourcePlayerId: sourcePlayer.id,
          mode: "redirect",
          targetParticipantUuid: targetParticipant.uuid,
          reason: "Identidade usada na sala"
        }
      ]
    });

    expect(settled.appearances.items[0]).toMatchObject({
      sourcePlayerId: sourcePlayer.id,
      playingTimeSeconds: 600,
      registered: false,
      onRoster: false,
      attribution: {
        mode: "redirect",
        targetParticipantUuid: targetParticipant.uuid
      }
    });

    let statistics = await successfulJson(
      await request(
        `/api/championships/${championship.uuid}/statistics?actorAccountUuid=${admin.uuid}`
      )
    );
    expect(statistics.players.items).toEqual([
      expect.objectContaining({
        participantUuid: targetParticipant.uuid,
        matchesPlayed: 1,
        playingTimeSeconds: 600
      })
    ]);

    championship = await getChampionship(championship.uuid);
    const detached = await request(
      `/api/championships/${championship.uuid}/matches/${fixture.matches[0].uuid}/evidence`,
      {
        method: "DELETE",
        body: command(admin, championship.revision, {
          expectedEvidenceRevision: 1,
          reason: "Replay indisponível após a homologação"
        })
      }
    );

    expect(detached.status).toBe(200);
    championship = await getChampionship(championship.uuid);
    const attributionResponse = await request(
      `/api/championships/${championship.uuid}/matches/${fixture.matches[0].uuid}/attributions`,
      {
        method: "PUT",
        body: command(admin, championship.revision, {
          expectedResultRevision: settled.match.resultRevision,
          attributions: [
            {
              sourcePlayerId: sourcePlayer.id,
              mode: "exclude",
              reason: "Participação anulada"
            }
          ]
        })
      }
    );

    expect(attributionResponse.status).toBe(200);
    expect(
      (await attributionResponse.json()).appearances.items[0]
    ).toMatchObject({
      sourcePlayerId: sourcePlayer.id,
      playingTimeSeconds: 600,
      attribution: { mode: "exclude" }
    });

    statistics = await successfulJson(
      await request(
        `/api/championships/${championship.uuid}/statistics?actorAccountUuid=${admin.uuid}`
      )
    );
    expect(statistics.players.items).toEqual([]);
  });

  it("maps compatible statistics from different event schemas into one canonical metric", async () => {
    const playerAccount = await createAccountWithPermissions([]);
    const sourcePlayer = await createPlayer("Artilheiro multiversão");
    const associationResponse = await request(
      `/api/players/${sourcePlayer.id}/account`,
      {
        method: "PATCH",
        body: { accountUuid: playerAccount.uuid }
      }
    );

    expect(associationResponse.status).toBe(200);

    const firstSchema = await createMetricSchema("phase5-old", "old-points");
    const secondSchema = await createMetricSchema("phase5-new", "new-points");
    const fixture = await createSettlementFixture(4);
    let championship = fixture.championship;
    const openResponse = await request(
      `/api/championships/${championship.uuid}/registration/transitions`,
      {
        method: "POST",
        body: command(admin, championship.revision, { operation: "open" })
      }
    );

    expect(openResponse.status).toBe(200);
    championship = await openResponse.json();
    const registrationResponse = await request(
      `/api/championships/${championship.uuid}/registrations/self`,
      {
        method: "POST",
        body: command(playerAccount, championship.revision, {})
      }
    );

    expect(registrationResponse.status).toBe(201);
    const participant = await registrationResponse.json();
    championship = await getChampionship(championship.uuid);
    const firstRound = fixture.matches
      .filter((match) => match.label.includes("Semifinal"))
      .sort((left, right) => left.displayOrder - right.displayOrder);

    for (const [index, metricSchema] of [firstSchema, secondSchema].entries()) {
      const physicalMatch = await createCompletedPhysicalMatch(
        { red: 2 + index, blue: 1 },
        {
          eventSchema: {
            id: metricSchema.id,
            version: metricSchema.version
          },
          events: [
            {
              type: MATCH_ROOM_EVENT.PlayerTeamChange,
              domain: "room",
              scope: "player",
              actorPlayerId: sourcePlayer.id,
              value: {},
              team: "red",
              occurredAt: `2026-09-0${index + 1}T20:00:00.000Z`,
              elapsedSeconds: 0
            },
            {
              type: "score",
              domain: "game",
              scope: "player",
              actorPlayerId: sourcePlayer.id,
              value: index === 0 ? 2 : 4
            },
            {
              type: MATCH_ROOM_EVENT.PlayerLeave,
              domain: "room",
              scope: "player",
              actorPlayerId: sourcePlayer.id,
              value: {},
              occurredAt: `2026-09-0${index + 1}T20:10:00.000Z`,
              elapsedSeconds: 600
            }
          ]
        }
      );
      await attachEvidence(championship, firstRound[index], physicalMatch.id);
      championship = await getChampionship(championship.uuid);
      await settleMatch(championship, firstRound[index], {
        method: "played",
        sideAPlayedScore: 2 + index,
        sideBPlayedScore: 1,
        sideAOutcome: "win",
        sideBOutcome: "loss"
      });
      championship = await getChampionship(championship.uuid);
    }

    const beforeMapping = await successfulJson(
      await request(
        `/api/championships/${championship.uuid}/statistics?actorAccountUuid=${admin.uuid}`
      )
    );
    const beforePlayer = beforeMapping.players.items.find(
      (item: { participantUuid: string | null }) =>
        item.participantUuid === participant.uuid
    );

    expect(beforePlayer.metrics).toMatchObject({
      "old-points": 2,
      "new-points": 4
    });
    expect(beforeMapping.metricSources).toMatchObject({
      totalCount: 2,
      truncated: false,
      items: expect.arrayContaining([
        expect.objectContaining({
          eventSchemaId: firstSchema.id,
          eventSchemaVersion: firstSchema.version,
          metricKey: "old-points",
          label: "old-points",
          valueKind: "number",
          mappedCanonicalMetricKey: null
        }),
        expect.objectContaining({
          eventSchemaId: secondSchema.id,
          eventSchemaVersion: secondSchema.version,
          metricKey: "new-points",
          label: "new-points",
          valueKind: "number",
          mappedCanonicalMetricKey: null
        })
      ])
    });

    const mappingResponse = await request(
      `/api/championships/${championship.uuid}/statistic-mappings`,
      {
        method: "PUT",
        body: command(admin, championship.revision, {
          mappings: [
            {
              eventSchemaId: firstSchema.id,
              eventSchemaVersion: firstSchema.version,
              sourceMetricKey: "old-points",
              canonicalMetricKey: "points",
              displayLabel: "Pontos",
              valueKind: "integer",
              aggregation: "sum"
            },
            {
              eventSchemaId: secondSchema.id,
              eventSchemaVersion: secondSchema.version,
              sourceMetricKey: "new-points",
              canonicalMetricKey: "points",
              displayLabel: "Pontos",
              valueKind: "integer",
              aggregation: "sum"
            }
          ]
        })
      }
    );

    expect(mappingResponse.status).toBe(200);
    expect(await mappingResponse.json()).toMatchObject({
      totalCount: 2,
      truncated: false,
      items: [
        expect.objectContaining({
          canonicalMetricKey: "points",
          source: expect.objectContaining({ metricKey: "new-points" })
        }),
        expect.objectContaining({
          canonicalMetricKey: "points",
          source: expect.objectContaining({ metricKey: "old-points" })
        })
      ]
    });

    const afterMapping = await successfulJson(
      await request(
        `/api/championships/${championship.uuid}/statistics?actorAccountUuid=${admin.uuid}`
      )
    );
    const afterPlayer = afterMapping.players.items.find(
      (item: { participantUuid: string | null }) =>
        item.participantUuid === participant.uuid
    );

    expect(afterPlayer).toMatchObject({
      matchesPlayed: 2,
      playingTimeSeconds: 1200,
      metrics: {
        points: 6
      },
      sourceSeparatedMetrics: []
    });
    expect(afterMapping.metricSources.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metricKey: "old-points",
          mappedCanonicalMetricKey: "points"
        }),
        expect.objectContaining({
          metricKey: "new-points",
          mappedCanonicalMetricKey: "points"
        })
      ])
    );
  });

  it("keeps unfinished room games ineligible for evidence attachment", async () => {
    const fixture = await createSettlementFixture(2);
    const ongoingResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "ongoing",
        initiatedAt: "2026-09-02T20:00:00.000Z"
      }
    });

    expect(ongoingResponse.status).toBe(201);
    const ongoing = await ongoingResponse.json();
    const candidatesResponse = await request(
      `/api/championships/${fixture.championship.uuid}/matches/${fixture.matches[0].uuid}/evidence-candidates?actorAccountUuid=${admin.uuid}&logicalMatchId=${ongoing.id}`
    );

    expect(candidatesResponse.status).toBe(200);
    expect(await candidatesResponse.json()).toMatchObject({
      items: [],
      nextCursor: null,
      totalInspected: 1
    });

    const attachResponse = await request(
      `/api/championships/${fixture.championship.uuid}/matches/${fixture.matches[0].uuid}/evidence`,
      {
        method: "PUT",
        body: command(admin, fixture.championship.revision, {
          expectedEvidenceRevision: 0,
          logicalMatchId: ongoing.id,
          orientation: "aligned"
        })
      }
    );

    expect(attachResponse.status).toBe(409);
    expect(await attachResponse.json()).toMatchObject({
      error: {
        code: "CONFLICT",
        message: "Only completed logical matches can become evidence"
      }
    });
  });

  it("previews and applies recursive correction impact while preserving downstream scheduling", async () => {
    const fixture = await createSettlementFixture(4);
    let championship = fixture.championship;
    const firstRound = fixture.matches
      .filter((match) => match.label.includes("Semifinal"))
      .sort((left, right) => left.displayOrder - right.displayOrder);
    const final = fixture.matches.find((match) =>
      match.label.includes("Final")
    );

    expect(firstRound).toHaveLength(2);
    expect(final).toBeDefined();
    const finalMatch = final!;

    await settleMatch(championship, firstRound[0], {
      method: "manual",
      sideAPlayedScore: 2,
      sideBPlayedScore: 0,
      sideAOutcome: "win",
      sideBOutcome: "loss"
    });
    championship = await getChampionship(championship.uuid);
    await settleMatch(championship, firstRound[1], {
      method: "manual",
      sideAPlayedScore: 3,
      sideBPlayedScore: 1,
      sideAOutcome: "win",
      sideBOutcome: "loss"
    });
    championship = await getChampionship(championship.uuid);
    const format = await (
      await request(
        `/api/championships/${championship.uuid}/format?actorAccountUuid=${admin.uuid}&limit=100`
      )
    ).json();
    const populatedFinal = format.matches.items.find(
      (match: { uuid: string }) => match.uuid === finalMatch.uuid
    );
    const scheduleResponse = await request(
      `/api/championships/${championship.uuid}/championship-matches/${finalMatch.uuid}/schedule`,
      {
        method: "PATCH",
        body: command(admin, championship.revision, {
          expectedMatchRevision: populatedFinal.revision,
          scheduledAt: "2026-09-12T21:00:00.000Z",
          scheduleStatus: "scheduled"
        })
      }
    );

    expect(scheduleResponse.status).toBe(200);
    championship = await getChampionship(championship.uuid);
    const settledFinal = await settleMatch(championship, finalMatch, {
      method: "manual",
      sideAPlayedScore: 1,
      sideBPlayedScore: 0,
      sideAOutcome: "win",
      sideBOutcome: "loss"
    });

    expect(settledFinal.result).not.toBeNull();
    championship = await getChampionship(championship.uuid);
    const sourceOperations = await (
      await request(
        `/api/championships/${championship.uuid}/matches/${firstRound[0].uuid}?actorAccountUuid=${admin.uuid}`
      )
    ).json();
    const correctionDraft = settlementDraft({
      method: "manual",
      sideAPlayedScore: 0,
      sideBPlayedScore: 2,
      sideAOutcome: "loss",
      sideBOutcome: "win"
    });
    const previewResponse = await request(
      `/api/championships/${championship.uuid}/matches/${firstRound[0].uuid}/correction-previews`,
      {
        method: "POST",
        body: {
          actorAccountUuid: admin.uuid,
          ...correctionDraft
        }
      }
    );
    const preview = await previewResponse.json();

    expect(previewResponse.status).toBe(200);
    expect(preview.downstream).toEqual([
      expect.objectContaining({
        matchUuid: finalMatch.uuid,
        depth: 1,
        hadResult: true,
        schedulePreserved: true
      })
    ]);

    const correctionResponse = await request(
      `/api/championships/${championship.uuid}/matches/${firstRound[0].uuid}/corrections`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          ...correctionDraft,
          expectedEvidenceRevision: sourceOperations.match.evidenceRevision,
          expectedResultRevision: sourceOperations.match.resultRevision,
          previewHash: preview.previewHash
        })
      }
    );

    expect(correctionResponse.status).toBe(200);
    championship = await getChampionship(championship.uuid);
    const invalidatedFinal = await (
      await request(
        `/api/championships/${championship.uuid}/matches/${finalMatch.uuid}?actorAccountUuid=${admin.uuid}`
      )
    ).json();

    expect(invalidatedFinal.result).toBeNull();
    expect(invalidatedFinal.evidence).toBeNull();
    expect(invalidatedFinal.match).toMatchObject({
      scheduledAt: "2026-09-12T21:00:00.000Z",
      scheduleStatus: "scheduled"
    });
    expect(invalidatedFinal.resultHistory.items).toContainEqual(
      expect.objectContaining({ state: "invalidated" })
    );
  });

  it("rejects stale settlement previews without mutating the match", async () => {
    const fixture = await createSettlementFixture(2);
    const draft = settlementDraft({
      method: "manual",
      sideAPlayedScore: 1,
      sideBPlayedScore: 0,
      sideAOutcome: "win",
      sideBOutcome: "loss"
    });
    const preview = await (
      await request(
        `/api/championships/${fixture.championship.uuid}/matches/${fixture.matches[0].uuid}/settlement-previews`,
        {
          method: "POST",
          body: { actorAccountUuid: admin.uuid, ...draft }
        }
      )
    ).json();
    const staleResponse = await request(
      `/api/championships/${fixture.championship.uuid}/matches/${fixture.matches[0].uuid}/settlements`,
      {
        method: "POST",
        body: command(admin, fixture.championship.revision, {
          ...draft,
          sideAPlayedScore: 2,
          expectedEvidenceRevision: 0,
          expectedResultRevision: 0,
          previewHash: preview.previewHash
        })
      }
    );

    expect(staleResponse.status).toBe(409);
    const operations = await (
      await request(
        `/api/championships/${fixture.championship.uuid}/matches/${fixture.matches[0].uuid}?actorAccountUuid=${admin.uuid}`
      )
    ).json();
    expect(operations.result).toBeNull();
    expect(operations.match.resultRevision).toBe(0);
  });
});

async function createSettlementFixture(
  teamCount: number,
  options: {
    publish?: boolean;
    roomProgramIds?: string[];
    defaultRoomProgramId?: string;
  } = {}
) {
  const fixture = await createFormatFixture(teamCount, options);
  const generatedResponse = await request(
    `/api/championships/${fixture.championship.uuid}/stages/single-elimination`,
    {
      method: "POST",
      body: command(admin, fixture.championship.revision, {
        name: "Mata-mata operacional",
        teamIds: fixture.teams.map((team) => team.uuid),
        createCompetitionRounds: true
      })
    }
  );

  expect(generatedResponse.status).toBe(200);
  const format = await generatedResponse.json();
  let championship = await getChampionship(fixture.championship.uuid);

  if (options.publish) {
    const publishResponse = await request(
      `/api/championships/${championship.uuid}/transitions`,
      {
        method: "POST",
        body: command(admin, championship.revision, { transition: "publish" })
      }
    );

    expect(publishResponse.status).toBe(200);
    championship = await publishResponse.json();
  }

  return {
    ...fixture,
    championship,
    matches: format.matches.items as Array<{
      uuid: string;
      label: string;
      displayOrder: number;
      revision: number;
      evidenceRevision: number;
      resultRevision: number;
    }>
  };
}

async function successfulJson(response: Response) {
  const body = await response.json();

  if (!response.ok) {
    throw new Error(
      `Expected a successful response, received ${response.status}: ${JSON.stringify(body)}`
    );
  }

  return body;
}

async function createCompletedPhysicalMatch(
  score: { red: number; blue: number },
  options: {
    events?: Array<Record<string, unknown>>;
    eventSchema?: { id: string; version: number };
    roomId?: string;
  } = {}
) {
  const response = await request("/api/matches", {
    method: "POST",
    body: {
      status: "completed",
      initiatedAt: "2026-09-01T20:00:00.000Z",
      endedAt: "2026-09-01T20:10:00.000Z",
      score,
      ...(options.roomId ? { roomId: options.roomId } : {}),
      ...(options.events ? { events: options.events } : {}),
      ...(options.eventSchema ? { eventSchema: options.eventSchema } : {})
    }
  });

  expect(response.status).toBe(201);

  return response.json() as Promise<{ id: string }>;
}

function createTestRoomInstance(programUuid: string): string {
  const database = new Database(Bun.env.DATABASE_FILE);
  database.exec("PRAGMA foreign_keys = ON");

  try {
    const program = database
      .query<{ id: number }, [string]>(
        "SELECT id FROM room_programs WHERE uuid = ?"
      )
      .get(programUuid);

    if (!program) {
      throw new Error(`Room program ${programUuid} was not found`);
    }

    const now = new Date().toISOString();
    const versionUuid = crypto.randomUUID();
    const version = database
      .query<{ id: number }, [string, number, string, string, string]>(
        `INSERT INTO room_program_versions
          (uuid, program_id, version, artifact, entrypoint, install_strategy, created_at, updated_at)
         VALUES (?, ?, 'v1.0.0', ?, 'dist/index.js', 'none', ?, ?)
         RETURNING id`
      )
      .get(
        versionUuid,
        program.id,
        JSON.stringify({
          releaseId: versionUuid,
          tagName: "v1.0.0",
          assetName: "room-v1.0.0.tgz",
          assetUrl: "https://example.com/room-v1.0.0.tgz",
          publishedAt: now
        }),
        now,
        now
      );

    if (!version) {
      throw new Error("Room program version was not created");
    }

    const roomUuid = crypto.randomUUID();
    database
      .query<void, [string, number, number, string, string, string]>(
        `INSERT INTO room_instances
          (uuid, program_id, version_id, state, launch_config, public, comm_id_hash, created_at, updated_at)
         VALUES (?, ?, ?, 'closed', '{}', 0, ?, ?, ?)`
      )
      .run(roomUuid, program.id, version.id, `test-${roomUuid}`, now, now);

    return roomUuid;
  } finally {
    database.close();
  }
}

async function createMatchComposition(
  rounds: Array<{
    kind: "sequential" | "extra-time";
    number: number | null;
    matchId: string;
    orientation: "aligned" | "swapped";
  }>
) {
  const response = await request("/api/matches/compositions", {
    method: "POST",
    body: { rounds }
  });

  expect(response.status).toBe(201);

  return response.json() as Promise<{ id: string }>;
}

async function attachEvidence(
  championship: Championship,
  match: { uuid: string },
  logicalMatchId: string,
  orientation: "aligned" | "swapped" = "aligned"
) {
  const current = await getChampionship(championship.uuid);
  const operations = await (
    await request(
      `/api/championships/${championship.uuid}/matches/${match.uuid}?actorAccountUuid=${admin.uuid}`
    )
  ).json();
  const response = await request(
    `/api/championships/${championship.uuid}/matches/${match.uuid}/evidence`,
    {
      method: "PUT",
      body: command(admin, current.revision, {
        expectedEvidenceRevision: operations.match.evidenceRevision,
        logicalMatchId,
        orientation
      })
    }
  );

  expect(response.status).toBe(200);

  return response.json();
}

async function settleMatch(
  championship: Championship,
  match: { uuid: string },
  input: Record<string, unknown>
) {
  const current = await getChampionship(championship.uuid);
  const operations = await (
    await request(
      `/api/championships/${championship.uuid}/matches/${match.uuid}?actorAccountUuid=${admin.uuid}`
    )
  ).json();
  const draft = settlementDraft(input);
  const previewResponse = await request(
    `/api/championships/${championship.uuid}/matches/${match.uuid}/settlement-previews`,
    {
      method: "POST",
      body: {
        actorAccountUuid: admin.uuid,
        ...draft
      }
    }
  );

  expect(previewResponse.status).toBe(200);
  const preview = await previewResponse.json();
  const response = await request(
    `/api/championships/${championship.uuid}/matches/${match.uuid}/settlements`,
    {
      method: "POST",
      body: command(admin, current.revision, {
        ...draft,
        expectedEvidenceRevision: operations.match.evidenceRevision,
        expectedResultRevision: operations.match.resultRevision,
        previewHash: preview.previewHash
      })
    }
  );

  expect(response.status).toBe(200);

  return response.json();
}

function settlementDraft(input: Record<string, unknown>) {
  return {
    sideAAdministrativeScore: 0,
    sideBAdministrativeScore: 0,
    evidenceQualityReviewed: true,
    ...input
  };
}

async function createPlayer(name: string) {
  const response = await request("/api/players", {
    method: "POST",
    body: {
      externalId: `champ-player-${crypto.randomUUID()}`,
      name
    }
  });

  expect(response.status).toBe(201);

  return response.json() as Promise<{ id: string; name: string }>;
}

async function createMetricSchema(prefix: string, metricKey: string) {
  const response = await request("/api/event-schemas", {
    method: "POST",
    body: {
      name: `${prefix}-${crypto.randomUUID().slice(0, 8)}`,
      title: prefix,
      definition: {
        events: [
          {
            type: "score",
            valueSchema: { type: "number" },
            aggregations: [
              {
                target: "actor",
                metric: metricKey,
                initial: 0,
                step: {
                  op: "add",
                  args: [{ path: "acc" }, { path: "event.value" }]
                }
              }
            ]
          }
        ],
        metrics: [{ key: metricKey, label: metricKey }]
      }
    }
  });

  expect(response.status).toBe(201);

  return response.json() as Promise<{
    id: string;
    name: string;
    version: number;
  }>;
}

async function createFormatFixture(
  teamCount: number,
  options: {
    roomProgramIds?: string[];
    defaultRoomProgramId?: string;
  } = {}
) {
  let championship = await createChampionship(admin, competitionType, {
    name: `Format Cup ${teamCount}`,
    ...options
  });
  const teams: Array<{ uuid: string; name: string; revision: number }> = [];

  for (let index = 0; index < teamCount; index += 1) {
    const response = await request(
      `/api/championships/${championship.uuid}/teams`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          name: `Format Team ${index + 1}`,
          abbreviation: `F${index + 1}`,
          seed: index + 1,
          displayOrder: index
        })
      }
    );

    expect(response.status).toBe(201);
    teams.push(await response.json());
    championship = await getChampionship(championship.uuid);
  }

  return { championship, teams };
}

async function createSchedulingFixture() {
  const fixture = await createFormatFixture(2);
  let championship = fixture.championship;
  const gms = await Promise.all([
    createAccountWithPermissions([]),
    createAccountWithPermissions([])
  ]);
  const openResponse = await request(
    `/api/championships/${championship.uuid}/registration/transitions`,
    {
      method: "POST",
      body: command(admin, championship.revision, { operation: "open" })
    }
  );

  expect(openResponse.status).toBe(200);
  championship = await openResponse.json();
  const participants = [];

  for (const gm of gms) {
    const registrationResponse = await request(
      `/api/championships/${championship.uuid}/registrations/self`,
      {
        method: "POST",
        body: command(gm, championship.revision, {})
      }
    );

    expect(registrationResponse.status).toBe(201);
    participants.push(await registrationResponse.json());
    championship = await getChampionship(championship.uuid);
  }

  for (const [index, participant] of participants.entries()) {
    const moveResponse = await request(
      `/api/championships/${championship.uuid}/roster-moves`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          participantId: participant.uuid,
          targetTeamId: fixture.teams[index]!.uuid,
          role: "gm"
        })
      }
    );

    await successfulJson(moveResponse.clone());
    championship = await getChampionship(championship.uuid);
  }

  const formatResponse = await request(
    `/api/championships/${championship.uuid}/stages/single-elimination`,
    {
      method: "POST",
      body: command(admin, championship.revision, {
        name: "Copa de agenda",
        teamIds: fixture.teams.map((team) => team.uuid),
        createCompetitionRounds: true,
        firstRoundStartsAt: "2027-01-01T18:00:00.000Z",
        roundDurationHours: 12
      })
    }
  );

  expect(formatResponse.status).toBe(200);

  return {
    championship,
    format: await formatResponse.json(),
    teams: fixture.teams,
    gms
  };
}

async function createDraftFixture(input: {
  teamCount: number;
  playerCount: number;
  rounds: number;
  countdownSeconds?: number;
  capUnits?: number;
  gmPrice?: number;
  playerPrices?: number[];
  maximumTradeDifference?: number;
}) {
  const gmPrice = input.gmPrice ?? 10;
  const playerPrices =
    input.playerPrices ??
    Array.from({ length: input.playerCount }, (_, index) => 20 + index * 5);
  const gms = draftGms.slice(0, input.teamCount);
  const players = draftPlayers.slice(0, input.playerCount);

  const type = await createCompetitionType(admin, {
    name: "Draft Cup",
    championshipRules: rules({
      salaryEnabled: true,
      capUnits: input.capUnits ?? 150,
      draftRounds: input.rounds,
      countdownSeconds: input.countdownSeconds ?? 60,
      maximumTradeDifference: input.maximumTradeDifference ?? 10
    })
  });
  let championship = await createChampionship(admin, type, {
    name: "Draft Operations Cup"
  });
  const teams: Array<{
    uuid: string;
    name: string;
    rosterRevision: number;
  }> = [];

  for (let index = 0; index < input.teamCount; index += 1) {
    const response = await request(
      `/api/championships/${championship.uuid}/teams`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          name: `Draft Team ${index + 1}`,
          abbreviation: `D${index + 1}`,
          displayOrder: index + 1
        })
      }
    );

    expect(response.status).toBe(201);
    teams.push(await response.json());
    championship = await getChampionship(championship.uuid);
  }

  const openResponse = await request(
    `/api/championships/${championship.uuid}/registration/transitions`,
    {
      method: "POST",
      body: command(admin, championship.revision, { operation: "open" })
    }
  );

  expect(openResponse.status).toBe(200);
  championship = await openResponse.json();
  const gmParticipants: Array<{ uuid: string; displayName: string }> = [];
  const playerParticipants: Array<{ uuid: string; displayName: string }> = [];

  for (const [index, account] of [...gms, ...players].entries()) {
    const response = await request(
      `/api/championships/${championship.uuid}/registrations/self`,
      {
        method: "POST",
        body: command(account, championship.revision, {})
      }
    );

    expect(response.status).toBe(201);
    const participant = await response.json();

    if (index < gms.length) {
      gmParticipants.push(participant);
    } else {
      playerParticipants.push(participant);
    }

    championship = await getChampionship(championship.uuid);
  }

  const prices = [
    ...gmParticipants.map((participant) => ({
      participantId: participant.uuid,
      priceUnits: gmPrice
    })),
    ...playerParticipants.map((participant, index) => ({
      participantId: participant.uuid,
      priceUnits: playerPrices[index]!
    }))
  ];
  const priceResponse = await request(
    `/api/championships/${championship.uuid}/salary/prices`,
    {
      method: "PUT",
      body: command(admin, championship.revision, { prices })
    }
  );

  expect(priceResponse.status).toBe(200);
  championship = await getChampionship(championship.uuid);
  const closeResponse = await request(
    `/api/championships/${championship.uuid}/registration/transitions`,
    {
      method: "POST",
      body: command(admin, championship.revision, { operation: "close" })
    }
  );

  expect(closeResponse.status).toBe(200);
  championship = await closeResponse.json();
  const freezeResponse = await request(
    `/api/championships/${championship.uuid}/salary/prices/freeze`,
    {
      method: "POST",
      body: command(admin, championship.revision, {
        reason: "Valores finais do draft"
      })
    }
  );

  expect(freezeResponse.status).toBe(200);
  championship = await getChampionship(championship.uuid);

  for (const [index, participant] of gmParticipants.entries()) {
    const moveResponse = await request(
      `/api/championships/${championship.uuid}/roster-moves`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          participantId: participant.uuid,
          targetTeamId: teams[index]!.uuid,
          role: "gm"
        })
      }
    );

    expect(moveResponse.status).toBe(200);
    championship = await getChampionship(championship.uuid);
  }

  const configureResponse = await request(
    `/api/championships/${championship.uuid}/draft`,
    {
      method: "PUT",
      body: command(admin, championship.revision, {
        teamIds: teams.map(({ uuid }) => uuid),
        rounds: input.rounds,
        countdownSeconds: input.countdownSeconds ?? 60
      })
    }
  );

  if (configureResponse.status !== 200) {
    throw new Error(
      `Draft configuration failed: ${configureResponse.status} ${await configureResponse.text()}`
    );
  }
  const draft = await configureResponse.json();
  championship = await getChampionship(championship.uuid);

  return {
    championship,
    draft,
    teams,
    gms,
    players,
    gmParticipants,
    playerParticipants,
    gmPrice,
    playerPrices
  };
}

async function createTradeFixture() {
  const fixture = await createDraftFixture({
    teamCount: 2,
    playerCount: 4,
    rounds: 2,
    capUnits: 100,
    gmPrice: 10,
    playerPrices: [40, 30, 35, 25],
    maximumTradeDifference: 10
  });
  let championship = fixture.championship;

  for (const [index, participant] of fixture.playerParticipants.entries()) {
    const targetTeam = index < 2 ? fixture.teams[0]! : fixture.teams[1]!;
    const moveResponse = await request(
      `/api/championships/${championship.uuid}/roster-moves`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          participantId: participant.uuid,
          targetTeamId: targetTeam.uuid
        })
      }
    );

    expect(moveResponse.status).toBe(200);
    championship = await getChampionship(championship.uuid);
  }

  const salary = await (
    await request(`/api/championships/${championship.uuid}/salary`)
  ).json();
  const rosterRevisions = fixture.teams.map(
    (team) =>
      salary.teams.items.find(
        ({ uuid }: { uuid: string }) => uuid === team.uuid
      ).rosterRevision as number
  );

  return {
    ...fixture,
    championship,
    rosterRevisions
  };
}

describe("championship historical reconstruction", () => {
  it("previews, applies, links, and rolls back a mixed historical import", async () => {
    let championship = await createChampionship(admin, competitionType, {
      name: "Historical Cup",
      historical: true,
      createCompleted: true
    });
    const linkedAccount = await createAccountWithPermissions([]);
    const source = JSON.stringify([
      {
        entityType: "team",
        sourceKey: "aurora",
        name: "Aurora 2019",
        abbreviation: "AUR",
        legacyDivision: "north"
      },
      {
        entityType: "team",
        sourceKey: "bravos",
        name: "Bravos 2019",
        abbreviation: "BRA"
      },
      {
        entityType: "historical-player",
        sourceKey: "legacy-player",
        displayName: "Legacy Player",
        aliases: "Old Nick|LP"
      },
      {
        entityType: "participant",
        sourceKey: "legacy-participant",
        displayName: "Legacy Player",
        historicalPlayerKey: "legacy-player"
      },
      {
        entityType: "roster-membership",
        sourceKey: "aurora-player",
        teamKey: "aurora",
        participantKey: "legacy-participant",
        role: "player"
      },
      {
        entityType: "stage",
        sourceKey: "final-stage",
        name: "Final histórica",
        engine: "manual"
      },
      {
        entityType: "match",
        sourceKey: "final-match",
        stageKey: "final-stage",
        label: "Final",
        sideATeamKey: "aurora",
        sideBTeamKey: "bravos",
        sideAScore: 3,
        sideBScore: 2,
        playedAt: "2019-08-10T21:00:00.000Z"
      },
      {
        entityType: "statistic",
        sourceKey: "legacy-goals",
        matchKey: "final-match",
        participantKey: "legacy-participant",
        teamKey: "aurora",
        metricKey: "goals",
        numericValue: 2
      },
      {
        entityType: "placement",
        sourceKey: "champion",
        teamKey: "aurora",
        rank: 1
      },
      {
        entityType: "award",
        sourceKey: "mvp",
        kind: "mvp",
        targetType: "historical-player",
        targetKey: "legacy-player",
        displayLabel: "MVP"
      },
      {
        entityType: "record",
        sourceKey: "record-goals",
        metricKey: "goals",
        targetType: "historical-player",
        targetKey: "legacy-player",
        numericValue: 2
      }
    ]);
    const previewResponse = await request(
      `/api/championships/${championship.uuid}/historical-imports/preview`,
      {
        method: "POST",
        body: {
          actorAccountUuid: admin.uuid,
          format: "json",
          sourceName: "historical-cup.json",
          source,
          mapping: {}
        }
      }
    );

    expect(previewResponse.status).toBe(201);
    const preview = await previewResponse.json();
    expect(preview).toMatchObject({
      state: "previewed",
      rowCount: 11,
      validCount: 10,
      warningCount: 1,
      invalidCount: 0
    });
    expect(preview.rows.items[0]).toMatchObject({
      state: "warning",
      normalized: {
        unmapped: { legacyDivision: "north" }
      }
    });

    const duplicatePreview = await successfulJson(
      await request(
        `/api/championships/${championship.uuid}/historical-imports/preview`,
        {
          method: "POST",
          body: {
            actorAccountUuid: admin.uuid,
            format: "json",
            sourceName: "duplicate-name.json",
            source,
            mapping: {}
          }
        }
      )
    );
    expect(duplicatePreview.uuid).toBe(preview.uuid);

    const applyResponse = await request(
      `/api/championships/${championship.uuid}/historical-imports/${preview.uuid}/apply`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          reason: "Reconstrução validada pela staff"
        })
      }
    );

    await successfulJson(applyResponse.clone());
    const applied = await applyResponse.json();
    expect(applied).toMatchObject({
      state: "applied",
      appliedCount: 11,
      errorCount: 0
    });
    championship = await getChampionship(championship.uuid);
    const history = await successfulJson(
      await request(
        `/api/championships/${championship.uuid}/history?actorAccountUuid=${admin.uuid}`
      )
    );
    expect(history.completeness).toEqual({
      placements: true,
      awards: true,
      teams: true,
      rosters: true,
      matches: true,
      detailedStatistics: true
    });

    const historicalPlayer = applied.rows.items.find(
      (row: { entityType: string }) => row.entityType === "historical-player"
    );
    const linkResponse = await request(
      `/api/championships/${championship.uuid}/historical-players/${historicalPlayer.entityUuid}/link`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          accountUuid: linkedAccount.uuid,
          expectedLinkedAccountUuid: null,
          reason: "Identidade confirmada pelo jogador"
        })
      }
    );

    expect(linkResponse.status).toBe(200);
    expect(await linkResponse.json()).toMatchObject({
      displayName: "Legacy Player",
      linkedAccount: { uuid: linkedAccount.uuid }
    });
    championship = await getChampionship(championship.uuid);
    const publishResponse = await request(
      `/api/championships/${championship.uuid}/transitions`,
      {
        method: "POST",
        body: command(admin, championship.revision, { transition: "publish" })
      }
    );
    expect(publishResponse.status).toBe(200);
    championship = await getChampionship(championship.uuid);
    const accountHistory = await successfulJson(
      await request(
        `/api/championships/accounts/${linkedAccount.uuid}/history?actorAccountUuid=${admin.uuid}`
      )
    );
    expect(accountHistory.editions).toContainEqual(
      expect.objectContaining({
        championshipUuid: championship.uuid,
        displayNameSnapshot: "Legacy Player"
      })
    );

    const dependentPreview = await successfulJson(
      await request(
        `/api/championships/${championship.uuid}/historical-imports/preview`,
        {
          method: "POST",
          body: {
            actorAccountUuid: admin.uuid,
            format: "json",
            sourceName: "historical-cup-awards.json",
            source: JSON.stringify([
              {
                entityType: "award",
                sourceKey: "legacy-highlight",
                kind: "highlight",
                targetType: "historical-player",
                targetKey: "legacy-player",
                displayLabel: "Destaque histórico"
              }
            ]),
            mapping: {}
          }
        }
      )
    );
    const dependentApplied = await successfulJson(
      await request(
        `/api/championships/${championship.uuid}/historical-imports/${dependentPreview.uuid}/apply`,
        {
          method: "POST",
          body: command(admin, championship.revision, {
            reason: "Complemento do acervo histórico"
          })
        }
      )
    );
    expect(dependentApplied).toMatchObject({
      state: "applied",
      appliedCount: 1,
      errorCount: 0
    });
    championship = await getChampionship(championship.uuid);
    const dependentRollback = await request(
      `/api/championships/${championship.uuid}/historical-imports/${dependentPreview.uuid}/rollback`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          reason: "Verificação de dependência entre lotes"
        })
      }
    );
    expect(dependentRollback.status).toBe(200);
    championship = await getChampionship(championship.uuid);

    const rollbackResponse = await request(
      `/api/championships/${championship.uuid}/historical-imports/${preview.uuid}/rollback`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          reason: "Teste de rollback integral"
        })
      }
    );

    expect(rollbackResponse.status).toBe(200);
    expect(await rollbackResponse.json()).toMatchObject({
      state: "rolled-back"
    });
    const afterRollback = await successfulJson(
      await request(
        `/api/championships/${championship.uuid}/history?actorAccountUuid=${admin.uuid}`
      )
    );
    expect(afterRollback.completeness).toEqual({
      placements: false,
      awards: false,
      teams: false,
      rosters: false,
      matches: false,
      detailedStatistics: false
    });
  });
});

describe("championship honor catalog and edition honors", () => {
  it("seeds the catalog permission and publishes immutable reusable definitions", async () => {
    const permissionKeys = (
      await paginatedItems<{ key: string }>(
        await request("/api/permissions?limit=100")
      )
    ).map(({ key }) => key);
    expect(permissionKeys).toContain("honor-definition:admin");

    const createResponse = await request(
      "/api/championships/honor-definitions",
      {
        method: "POST",
        body: {
          actorAccountUuid: admin.uuid,
          competitionTypeId: competitionType.uuid,
          slug: uniqueSlug("most-valuable-player"),
          kind: "award",
          name: "Jogador mais valioso",
          description: "Reconhece o principal destaque da edição.",
          recipientTypes: ["participant", "account"],
          minimumRecipients: 1,
          maximumRecipients: 1,
          aggregateByIdentity: false,
          presentation: { icon: "star" }
        }
      }
    );
    expect(createResponse.status).toBe(201);
    const definition = await createResponse.json();
    expect(definition).toMatchObject({
      kind: "award",
      competitionType: { uuid: competitionType.uuid },
      draft: { name: "Jogador mais valioso", revision: 0 },
      versions: []
    });

    const publishResponse = await request(
      `/api/championships/honor-definitions/${definition.uuid}/publish`,
      {
        method: "POST",
        body: {
          actorAccountUuid: admin.uuid,
          expectedRevision: definition.draft.revision
        }
      }
    );
    expect(publishResponse.status).toBe(200);
    const published = await publishResponse.json();
    expect(published.published).toBe(true);
    expect(published.versions).toEqual([
      expect.objectContaining({ version: 1, name: "Jogador mais valioso" })
    ]);

    const retry = await request(
      `/api/championships/honor-definitions/${definition.uuid}/publish`,
      {
        method: "POST",
        body: {
          actorAccountUuid: admin.uuid,
          expectedRevision: definition.draft.revision
        }
      }
    );
    expect(retry.status).toBe(200);
    expect((await retry.json()).published).toBe(false);
  });

  it("announces an honor before it has a winner and later awards it", async () => {
    const definitionResponse = await request(
      "/api/championships/honor-definitions",
      {
        method: "POST",
        body: {
          actorAccountUuid: admin.uuid,
          competitionTypeId: competitionType.uuid,
          slug: uniqueSlug("cup-mvp"),
          kind: "award",
          name: "MVP da copa",
          description: "Premiação individual da edição.",
          recipientTypes: ["account"],
          minimumRecipients: 1,
          maximumRecipients: 1,
          aggregateByIdentity: false
        }
      }
    );
    const definition = await definitionResponse.json();
    const publishResponse = await request(
      `/api/championships/honor-definitions/${definition.uuid}/publish`,
      {
        method: "POST",
        body: {
          actorAccountUuid: admin.uuid,
          expectedRevision: 0
        }
      }
    );
    const version = (await publishResponse.json()).versions[0];
    let championship = await createChampionship(admin, competitionType, {
      name: "Honors Cup"
    });

    const offeringResponse = await request(
      `/api/championships/${championship.uuid}/honors`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          definitionVersionUuid: version.uuid,
          state: "announced",
          decisionPolicy: { type: "staff-selection" },
          displayOrder: 1
        })
      }
    );
    expect(offeringResponse.status).toBe(201);
    const honor = await offeringResponse.json();
    expect(honor).toMatchObject({
      state: "announced",
      name: "MVP da copa",
      grants: []
    });

    championship = await getChampionship(championship.uuid);
    const grantResponse = await request(
      `/api/championships/${championship.uuid}/honors/${honor.uuid}/grants`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          target: { type: "account", uuid: admin.uuid },
          note: "Escolha confirmada pela organização",
          reason: "Resultado oficial da votação"
        })
      }
    );
    expect(grantResponse.status).toBe(200);
    expect(await grantResponse.json()).toMatchObject({
      state: "awarded",
      grants: [
        {
          target: { type: "account", uuid: admin.uuid },
          displayLabel: admin.name,
          revokedAt: null
        }
      ]
    });

    const publicResponse = await request(
      `/api/championships/${championship.uuid}/honors?limit=20`
    );
    expect(publicResponse.status).toBe(403);
    const staffResponse = await request(
      `/api/championships/${championship.uuid}/honors?actorAccountUuid=${admin.uuid}&includeDrafts=true&limit=20`
    );
    expect(staffResponse.status).toBe(200);
    expect(await paginatedItems(staffResponse)).toHaveLength(1);
  });

  it("previews placement titles and recalculates them after a correction", async () => {
    const definitionResponse = await request(
      "/api/championships/honor-definitions",
      {
        method: "POST",
        body: {
          actorAccountUuid: admin.uuid,
          competitionTypeId: competitionType.uuid,
          slug: uniqueSlug("cup-champion"),
          kind: "title",
          name: "Campeão da copa",
          recipientTypes: ["team"],
          minimumRecipients: 1,
          maximumRecipients: 1,
          aggregateByIdentity: false
        }
      }
    );
    const definition = await definitionResponse.json();
    const published = await (
      await request(
        `/api/championships/honor-definitions/${definition.uuid}/publish`,
        {
          method: "POST",
          body: { actorAccountUuid: admin.uuid, expectedRevision: 0 }
        }
      )
    ).json();
    let championship = await createChampionship(admin, competitionType, {
      name: "Calculated Honors Cup"
    });
    const teams = [];
    for (const name of ["Aurora", "Carbono"]) {
      const response = await request(
        `/api/championships/${championship.uuid}/teams`,
        {
          method: "POST",
          body: command(admin, championship.revision, { name })
        }
      );
      expect(response.status).toBe(201);
      teams.push(await response.json());
      championship = await getChampionship(championship.uuid);
    }
    const offeringResponse = await request(
      `/api/championships/${championship.uuid}/honors`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          definitionVersionUuid: published.versions[0].uuid,
          state: "announced",
          decisionPolicy: { type: "placement", ranks: [1] }
        })
      }
    );
    const honor = await offeringResponse.json();
    championship = await getChampionship(championship.uuid);
    await request(`/api/championships/${championship.uuid}/placements`, {
      method: "PUT",
      body: command(admin, championship.revision, {
        reason: "Classificação inicial confirmada",
        placements: [
          { teamUuid: teams[0].uuid, rank: 1 },
          { teamUuid: teams[1].uuid, rank: 2 }
        ]
      })
    });
    const preview = await (
      await request(
        `/api/championships/${championship.uuid}/honors/${honor.uuid}/resolution-preview?actorAccountUuid=${admin.uuid}`
      )
    ).json();
    expect(preview).toMatchObject({
      ready: true,
      contenders: [{ displayLabel: "Aurora", rank: 1 }]
    });
    championship = await getChampionship(championship.uuid);
    const resolvedResponse = await request(
      `/api/championships/${championship.uuid}/honors/${honor.uuid}/resolve`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          reason: "Resultado calculado conferido"
        })
      }
    );
    expect(await resolvedResponse.json()).toMatchObject({
      state: "awarded",
      grants: [
        expect.objectContaining({ displayLabel: "Aurora", revokedAt: null })
      ]
    });
    championship = await getChampionship(championship.uuid);
    const correctionResponse = await request(
      `/api/championships/${championship.uuid}/placements`,
      {
        method: "PUT",
        body: command(admin, championship.revision, {
          reason: "Classificação corrigida pela organização",
          placements: [
            { teamUuid: teams[1].uuid, rank: 1 },
            { teamUuid: teams[0].uuid, rank: 2 }
          ]
        })
      }
    );
    expect(correctionResponse.status).toBe(200);
    const honors = await paginatedItems<any>(
      await request(
        `/api/championships/${championship.uuid}/honors?actorAccountUuid=${admin.uuid}&includeDrafts=true&limit=20`
      )
    );
    expect(honors[0].grants.filter((grant: any) => !grant.revokedAt)).toEqual([
      expect.objectContaining({ displayLabel: "Carbono", rank: 1 })
    ]);
  });

  it("isolates reusable honors by competition type", async () => {
    const otherType = await createCompetitionType(admin, { name: "Season" });
    const sharedSlug = uniqueSlug("mvp");
    const definitions = [];
    for (const type of [competitionType, otherType]) {
      const response = await request("/api/championships/honor-definitions", {
        method: "POST",
        body: {
          actorAccountUuid: admin.uuid,
          competitionTypeId: type.uuid,
          slug: sharedSlug,
          kind: "award",
          name: "MVP",
          recipientTypes: ["account"],
          minimumRecipients: 1,
          maximumRecipients: 1,
          aggregateByIdentity: false
        }
      });
      expect(response.status).toBe(201);
      definitions.push(await response.json());
    }

    const filtered = await paginatedItems(
      await request(
        `/api/championships/honor-definitions?competitionTypeId=${otherType.uuid}&limit=20`
      )
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0]).toMatchObject({
      uuid: definitions[1].uuid,
      competitionType: { uuid: otherType.uuid }
    });

    const published = await (
      await request(
        `/api/championships/honor-definitions/${definitions[1].uuid}/publish`,
        {
          method: "POST",
          body: { actorAccountUuid: admin.uuid, expectedRevision: 0 }
        }
      )
    ).json();
    const championship = await createChampionship(admin, competitionType, {
      name: "Cup with foreign award"
    });
    const offeringResponse = await request(
      `/api/championships/${championship.uuid}/honors`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          definitionVersionUuid: published.versions[0].uuid,
          state: "announced",
          decisionPolicy: { type: "staff-selection" }
        })
      }
    );
    expect(offeringResponse.status).toBe(400);
  });

  it("reorders every active honor atomically", async () => {
    const definitionResponse = await request(
      "/api/championships/honor-definitions",
      {
        method: "POST",
        body: {
          actorAccountUuid: admin.uuid,
          competitionTypeId: competitionType.uuid,
          slug: uniqueSlug("ordered-award"),
          kind: "award",
          name: "Prêmio ordenável",
          recipientTypes: ["account"],
          minimumRecipients: 1,
          maximumRecipients: 1,
          aggregateByIdentity: false
        }
      }
    );
    const definition = await definitionResponse.json();
    const published = await (
      await request(
        `/api/championships/honor-definitions/${definition.uuid}/publish`,
        {
          method: "POST",
          body: { actorAccountUuid: admin.uuid, expectedRevision: 0 }
        }
      )
    ).json();
    let championship = await createChampionship(admin, competitionType, {
      name: "Ordered Honors Cup"
    });
    const honors = [];
    for (const nameOverride of ["Primeiro", "Segundo", "Terceiro"]) {
      const response = await request(
        `/api/championships/${championship.uuid}/honors`,
        {
          method: "POST",
          body: command(admin, championship.revision, {
            definitionVersionUuid: published.versions[0].uuid,
            state: "announced",
            nameOverride,
            decisionPolicy: { type: "staff-selection" }
          })
        }
      );
      expect(response.status).toBe(201);
      honors.push(await response.json());
      championship = await getChampionship(championship.uuid);
    }
    const honorUuids = honors
      .map((honor: { uuid: string }) => honor.uuid)
      .reverse();
    const reorderResponse = await request(
      `/api/championships/${championship.uuid}/honors/order`,
      {
        method: "PUT",
        body: command(admin, championship.revision, { honorUuids })
      }
    );
    expect(reorderResponse.status).toBe(200);
    expect(
      (await reorderResponse.json()).map(
        (honor: { uuid: string }) => honor.uuid
      )
    ).toEqual(honorUuids);
    championship = await getChampionship(championship.uuid);
    const invalidResponse = await request(
      `/api/championships/${championship.uuid}/honors/order`,
      {
        method: "PUT",
        body: command(admin, championship.revision, {
          honorUuids: honorUuids.slice(1)
        })
      }
    );
    expect(invalidResponse.status).toBe(400);
    expect(
      await paginatedItems(
        await request(
          `/api/championships/${championship.uuid}/honors?actorAccountUuid=${admin.uuid}&includeDrafts=true&limit=20`
        )
      )
    ).toEqual(honorUuids.map((uuid) => expect.objectContaining({ uuid })));
  });
});

describe("championship placements, awards, and archives", () => {
  it("completes double elimination without playing an inactive grand-final reset", async () => {
    const fixture = await createFormatFixture(2);
    const generated = await (
      await request(
        `/api/championships/${fixture.championship.uuid}/stages/double-elimination`,
        {
          method: "POST",
          body: command(admin, fixture.championship.revision, {
            name: "Final com reset condicional",
            teamIds: fixture.teams.map((team) => team.uuid),
            grandFinalReset: true
          })
        }
      )
    ).json();
    const winnersFinal = generated.matches.items.find(
      (match: { bracket: string }) => match.bracket === "winners"
    );
    const firstGrandFinal = generated.matches.items.find(
      (match: { bracket: string; bracketRound: number }) =>
        match.bracket === "grand-final" && match.bracketRound === 1
    );
    const reset = generated.matches.items.find(
      (match: { bracket: string; bracketRound: number }) =>
        match.bracket === "grand-final" && match.bracketRound === 2
    );

    await settleMatch(fixture.championship, winnersFinal, {
      method: "manual",
      sideAPlayedScore: 1,
      sideBPlayedScore: 0,
      sideAOutcome: "win",
      sideBOutcome: "loss"
    });
    await settleMatch(fixture.championship, firstGrandFinal, {
      method: "manual",
      sideAPlayedScore: 1,
      sideBPlayedScore: 0,
      sideAOutcome: "win",
      sideBOutcome: "loss"
    });
    const format = await (
      await request(
        `/api/championships/${fixture.championship.uuid}/format?actorAccountUuid=${admin.uuid}`
      )
    ).json();
    expect(
      format.matches.items.find(
        (match: { uuid: string }) => match.uuid === reset.uuid
      )
    ).toMatchObject({
      sideA: { team: null },
      sideB: { team: null },
      resultRevision: 0
    });

    let championship = await getChampionship(fixture.championship.uuid);
    const activate = await request(
      `/api/championships/${championship.uuid}/transitions`,
      {
        method: "POST",
        body: command(admin, championship.revision, { transition: "activate" })
      }
    );
    expect(activate.status).toBe(200);
    championship = await activate.json();
    const complete = await request(
      `/api/championships/${championship.uuid}/transitions`,
      {
        method: "POST",
        body: command(admin, championship.revision, { transition: "complete" })
      }
    );

    expect(complete.status).toBe(200);
  });

  it("requires an activated grand-final reset before completion", async () => {
    const fixture = await createFormatFixture(2);
    const generated = await (
      await request(
        `/api/championships/${fixture.championship.uuid}/stages/double-elimination`,
        {
          method: "POST",
          body: command(admin, fixture.championship.revision, {
            name: "Final reiniciada",
            teamIds: fixture.teams.map((team) => team.uuid),
            grandFinalReset: true
          })
        }
      )
    ).json();
    const winnersFinal = generated.matches.items.find(
      (match: { bracket: string }) => match.bracket === "winners"
    );
    const firstGrandFinal = generated.matches.items.find(
      (match: { bracket: string; bracketRound: number }) =>
        match.bracket === "grand-final" && match.bracketRound === 1
    );
    const reset = generated.matches.items.find(
      (match: { bracket: string; bracketRound: number }) =>
        match.bracket === "grand-final" && match.bracketRound === 2
    );

    await settleMatch(fixture.championship, winnersFinal, {
      method: "manual",
      sideAPlayedScore: 1,
      sideBPlayedScore: 0,
      sideAOutcome: "win",
      sideBOutcome: "loss"
    });
    await settleMatch(fixture.championship, firstGrandFinal, {
      method: "manual",
      sideAPlayedScore: 0,
      sideBPlayedScore: 1,
      sideAOutcome: "loss",
      sideBOutcome: "win"
    });
    const activatedFormat = await (
      await request(
        `/api/championships/${fixture.championship.uuid}/format?actorAccountUuid=${admin.uuid}`
      )
    ).json();
    expect(
      activatedFormat.matches.items.find(
        (match: { uuid: string }) => match.uuid === reset.uuid
      )
    ).toMatchObject({
      sideA: {
        team: expect.objectContaining({ uuid: fixture.teams[0]!.uuid })
      },
      sideB: {
        team: expect.objectContaining({ uuid: fixture.teams[1]!.uuid })
      },
      resultRevision: 0
    });

    let championship = await getChampionship(fixture.championship.uuid);
    const activate = await request(
      `/api/championships/${championship.uuid}/transitions`,
      {
        method: "POST",
        body: command(admin, championship.revision, { transition: "activate" })
      }
    );
    expect(activate.status).toBe(200);
    championship = await activate.json();
    const prematureComplete = await request(
      `/api/championships/${championship.uuid}/transitions`,
      {
        method: "POST",
        body: command(admin, championship.revision, { transition: "complete" })
      }
    );
    expect(prematureComplete.status).toBe(400);

    await settleMatch(fixture.championship, reset, {
      method: "manual",
      sideAPlayedScore: 2,
      sideBPlayedScore: 1,
      sideAOutcome: "win",
      sideBOutcome: "loss"
    });
    championship = await getChampionship(fixture.championship.uuid);
    const complete = await request(
      `/api/championships/${championship.uuid}/transitions`,
      {
        method: "POST",
        body: command(admin, championship.revision, { transition: "complete" })
      }
    );

    expect(complete.status).toBe(200);
  });

  it("keeps placement spots and the official placement ledger as one result", async () => {
    const fixture = await createSettlementFixture(2);
    const match = fixture.matches[0]!;
    const draft = settlementDraft({
      method: "manual",
      sideAPlayedScore: 2,
      sideBPlayedScore: 1,
      sideAOutcome: "win",
      sideBOutcome: "loss"
    });
    const preview = await (
      await request(
        `/api/championships/${fixture.championship.uuid}/matches/${match.uuid}/settlement-previews`,
        {
          method: "POST",
          body: { actorAccountUuid: admin.uuid, ...draft }
        }
      )
    ).json();
    const settleResponse = await request(
      `/api/championships/${fixture.championship.uuid}/matches/${match.uuid}/settlements`,
      {
        method: "POST",
        body: command(admin, fixture.championship.revision, {
          ...draft,
          expectedEvidenceRevision: 0,
          expectedResultRevision: 0,
          previewHash: preview.previewHash
        })
      }
    );

    expect(settleResponse.status).toBe(200);
    const history = await (
      await request(
        `/api/championships/${fixture.championship.uuid}/history?actorAccountUuid=${admin.uuid}`
      )
    ).json();
    expect(history.placements.items).toEqual([
      expect.objectContaining({
        rank: 1,
        source: "format",
        team: expect.objectContaining({ uuid: fixture.teams[0]!.uuid })
      }),
      expect.objectContaining({
        rank: 2,
        source: "format",
        team: expect.objectContaining({ uuid: fixture.teams[1]!.uuid })
      })
    ]);
    expect(history.records.items).toContainEqual(
      expect.objectContaining({
        key: "team.wins",
        category: "team",
        targetUuid: fixture.teams[0]!.uuid,
        value: 1,
        source: "statistics-ledger"
      })
    );
    expect(history.records.items).toContainEqual(
      expect.objectContaining({
        key: "team.points_for",
        targetUuid: fixture.teams[0]!.uuid,
        value: 2
      })
    );
    const format = await (
      await request(
        `/api/championships/${fixture.championship.uuid}/format?actorAccountUuid=${admin.uuid}`
      )
    ).json();
    expect(format.spots.items).toContainEqual(
      expect.objectContaining({
        kind: "placement",
        placementRank: 1,
        currentTeam: expect.objectContaining({
          uuid: fixture.teams[0]!.uuid
        })
      })
    );
    expect(format.spots.items).toContainEqual(
      expect.objectContaining({
        kind: "placement",
        placementRank: 2,
        currentTeam: expect.objectContaining({
          uuid: fixture.teams[1]!.uuid
        })
      })
    );

    const correctedDraft = settlementDraft({
      method: "manual",
      sideAPlayedScore: 1,
      sideBPlayedScore: 2,
      sideAOutcome: "loss",
      sideBOutcome: "win"
    });
    const correctedPreview = await (
      await request(
        `/api/championships/${fixture.championship.uuid}/matches/${match.uuid}/correction-previews`,
        {
          method: "POST",
          body: { actorAccountUuid: admin.uuid, ...correctedDraft }
        }
      )
    ).json();
    const currentChampionship = await getChampionship(
      fixture.championship.uuid
    );
    const correctionResponse = await request(
      `/api/championships/${fixture.championship.uuid}/matches/${match.uuid}/corrections`,
      {
        method: "POST",
        body: command(admin, currentChampionship.revision, {
          ...correctedDraft,
          expectedEvidenceRevision: 0,
          expectedResultRevision: 1,
          previewHash: correctedPreview.previewHash
        })
      }
    );

    expect(correctionResponse.status).toBe(200);
    const correctedHistory = await (
      await request(
        `/api/championships/${fixture.championship.uuid}/history?actorAccountUuid=${admin.uuid}`
      )
    ).json();
    expect(correctedHistory.placements.items).toEqual([
      expect.objectContaining({
        rank: 1,
        team: expect.objectContaining({ uuid: fixture.teams[1]!.uuid })
      }),
      expect.objectContaining({
        rank: 2,
        team: expect.objectContaining({ uuid: fixture.teams[0]!.uuid })
      })
    ]);
    expect(correctedHistory.records.items).toContainEqual(
      expect.objectContaining({
        key: "team.wins",
        targetUuid: fixture.teams[1]!.uuid,
        value: 1
      })
    );
  });

  it("does not require an artificial result revision for automatic bye matches", async () => {
    const fixture = await createFormatFixture(2);
    let championship = fixture.championship;
    let format = await (
      await request(`/api/championships/${championship.uuid}/stages`, {
        method: "POST",
        body: command(admin, championship.revision, {
          name: "Automatic advancement",
          engine: "manual"
        })
      })
    ).json();
    championship = await getChampionship(championship.uuid);
    const stage = format.stages.items[0];

    for (const [key, team] of [
      ["bye-a", fixture.teams[0]],
      ["bye-b", fixture.teams[1]]
    ] as const) {
      const response = await request(
        `/api/championships/${championship.uuid}/spots`,
        {
          method: "POST",
          body: command(admin, championship.revision, {
            stageId: stage.uuid,
            key,
            label: key,
            kind: "match-side",
            teamId: team.uuid
          })
        }
      );
      expect(response.status).toBe(200);
      format = await response.json();
      championship = await getChampionship(championship.uuid);
    }

    const matchResponse = await request(
      `/api/championships/${championship.uuid}/championship-matches`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          stageId: stage.uuid,
          label: "Avanço automático",
          sideASpotId: format.spots.items.find(
            (spot: { key: string }) => spot.key === "bye-a"
          ).uuid,
          sideBSpotId: format.spots.items.find(
            (spot: { key: string }) => spot.key === "bye-b"
          ).uuid,
          matchRulesOverride: { bye: true, automaticBye: true }
        })
      }
    );
    expect(matchResponse.status).toBe(200);
    championship = await getChampionship(championship.uuid);

    const placementResponse = await request(
      `/api/championships/${championship.uuid}/placements`,
      {
        method: "PUT",
        body: command(admin, championship.revision, {
          reason: "Automatic bracket positions",
          source: "format",
          placements: [
            { teamUuid: fixture.teams[0]!.uuid, rank: 1 },
            { teamUuid: fixture.teams[1]!.uuid, rank: 2 }
          ]
        })
      }
    );
    expect(placementResponse.status).toBe(200);
    championship = await getChampionship(championship.uuid);
    const activate = await request(
      `/api/championships/${championship.uuid}/transitions`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          transition: "activate"
        })
      }
    );
    expect(activate.status).toBe(200);
    championship = await activate.json();
    const complete = await request(
      `/api/championships/${championship.uuid}/transitions`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          transition: "complete"
        })
      }
    );

    expect(complete.status).toBe(200);
    expect(await complete.json()).toMatchObject({ lifecycle: "completed" });
  });

  it("snapshots placement identities without inventing a title", async () => {
    let championship = await createChampionship(admin, competitionType, {
      name: "Archive Cup"
    });
    const identityResponse = await request(
      `/api/championships/${championship.uuid}/team-identities`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          slug: uniqueSlug("archive-identity"),
          name: "Aurora Identity",
          abbreviation: "AUR"
        })
      }
    );
    expect(identityResponse.status).toBe(201);
    const identity = await identityResponse.json();
    championship = await getChampionship(championship.uuid);
    const teams = [];

    for (const [name, teamIdentityId] of [
      ["Aurora Cup", identity.uuid],
      ["Carbono Cup", undefined]
    ] as const) {
      const response = await request(
        `/api/championships/${championship.uuid}/teams`,
        {
          method: "POST",
          body: command(admin, championship.revision, {
            name,
            ...(teamIdentityId ? { teamIdentityId } : {})
          })
        }
      );
      expect(response.status).toBe(201);
      teams.push(await response.json());
      championship = await getChampionship(championship.uuid);
    }

    const activateResponse = await request(
      `/api/championships/${championship.uuid}/transitions`,
      {
        method: "POST",
        body: command(admin, championship.revision, { transition: "activate" })
      }
    );
    expect(activateResponse.status).toBe(200);
    championship = await activateResponse.json();
    const prematureResponse = await request(
      `/api/championships/${championship.uuid}/transitions`,
      {
        method: "POST",
        body: command(admin, championship.revision, { transition: "complete" })
      }
    );
    expect(prematureResponse.status).toBe(400);
    expect((await getChampionship(championship.uuid)).revision).toBe(
      championship.revision
    );

    const placementsResponse = await request(
      `/api/championships/${championship.uuid}/placements`,
      {
        method: "PUT",
        body: command(admin, championship.revision, {
          reason: "Final positions confirmed",
          placements: [
            { teamUuid: teams[0].uuid, rank: 1 },
            { teamUuid: teams[1].uuid, rank: 2 }
          ]
        })
      }
    );
    expect(placementsResponse.status).toBe(200);
    const history = await placementsResponse.json();
    expect(history.placements.items).toEqual([
      expect.objectContaining({
        rank: 1,
        teamNameSnapshot: "Aurora Cup",
        identitySnapshot: expect.objectContaining({ uuid: identity.uuid })
      }),
      expect.objectContaining({ rank: 2, teamNameSnapshot: "Carbono Cup" })
    ]);
    championship = await getChampionship(championship.uuid);
    const completeResponse = await request(
      `/api/championships/${championship.uuid}/transitions`,
      {
        method: "POST",
        body: command(admin, championship.revision, { transition: "complete" })
      }
    );
    expect(completeResponse.status).toBe(200);
    championship = await completeResponse.json();
    expect(championship.lifecycle).toBe("completed");
    const publishResponse = await request(
      `/api/championships/${championship.uuid}/transitions`,
      {
        method: "POST",
        body: command(admin, championship.revision, { transition: "publish" })
      }
    );
    expect(publishResponse.status).toBe(200);
    championship = await publishResponse.json();

    const identityHistoryResponse = await request(
      `/api/championships/team-identities/${identity.uuid}/history`
    );
    expect(identityHistoryResponse.status).toBe(200);
    expect(await identityHistoryResponse.json()).toMatchObject({
      titles: 0,
      editions: [
        {
          championshipUuid: championship.uuid,
          rank: 1,
          teamNameSnapshot: "Aurora Cup"
        }
      ]
    });
  });

  it("creates and audibly corrects account awards", async () => {
    let championship = await createChampionship(admin, competitionType, {
      name: "Award Cup",
      historical: true,
      createCompleted: true
    });
    const awardResponse = await request(
      `/api/championships/${championship.uuid}/awards`,
      {
        method: "POST",
        body: command(admin, championship.revision, {
          kind: "mvp",
          target: { type: "account", uuid: admin.uuid },
          displayLabel: "MVP",
          note: "Initial historical record"
        })
      }
    );
    expect(awardResponse.status).toBe(201);
    const award = await awardResponse.json();
    expect(award).toMatchObject({
      kind: "mvp",
      target: { type: "account", uuid: admin.uuid },
      displayLabel: "MVP"
    });
    championship = await getChampionship(championship.uuid);
    const correctionResponse = await request(
      `/api/championships/${championship.uuid}/awards/${award.uuid}`,
      {
        method: "PATCH",
        body: command(admin, championship.revision, {
          displayLabel: "Melhor jogador",
          reason: "Use the official award name"
        })
      }
    );
    expect(correctionResponse.status).toBe(200);
    expect(await correctionResponse.json()).toMatchObject({
      uuid: award.uuid,
      displayLabel: "Melhor jogador"
    });
    expect(
      (await request(`/api/championships/accounts/${admin.uuid}/history`))
        .status
    ).toBe(200);
  });

  it("rejects duplicate placements and foreign teams transactionally", async () => {
    let first = await createChampionship(admin, competitionType, {
      name: "Placement Validation Cup"
    });
    let second = await createChampionship(admin, competitionType, {
      name: "Foreign Team Cup"
    });
    const firstTeam = await (
      await request(`/api/championships/${first.uuid}/teams`, {
        method: "POST",
        body: command(admin, first.revision, { name: "Local Team" })
      })
    ).json();
    first = await getChampionship(first.uuid);
    const secondTeam = await (
      await request(`/api/championships/${second.uuid}/teams`, {
        method: "POST",
        body: command(admin, second.revision, { name: "Foreign Team" })
      })
    ).json();

    for (const placements of [
      [
        { teamUuid: firstTeam.uuid, rank: 1 },
        { teamUuid: secondTeam.uuid, rank: 2 }
      ],
      [
        { teamUuid: firstTeam.uuid, rank: 1 },
        { teamUuid: firstTeam.uuid, rank: 2 }
      ]
    ]) {
      const response = await request(
        `/api/championships/${first.uuid}/placements`,
        {
          method: "PUT",
          body: command(admin, first.revision, {
            reason: "Validation attempt",
            placements
          })
        }
      );
      expect(response.status).toBe(400);
      expect((await getChampionship(first.uuid)).revision).toBe(first.revision);
    }
  });
});

async function createAccountWithPermissions(
  permissions: string[]
): Promise<Account> {
  const suffix = crypto.randomUUID().slice(0, 8);
  const accountResponse = await request("/api/accounts", {
    method: "POST",
    body: {
      name: `Champ${suffix}`,
      password: "pass1234",
      externalId: uniqueExternalId()
    }
  });

  expect(accountResponse.status).toBe(201);

  const account = await accountResponse.json();

  if (permissions.length === 0) {
    return account;
  }

  const roleResponse = await request("/api/roles", {
    method: "POST",
    body: {
      name: `ch-role-${suffix}`,
      title: `Championship Role ${suffix}`,
      permissions
    }
  });

  expect(roleResponse.status).toBe(201);
  const role = await roleResponse.json();
  const updateResponse = await request(`/api/accounts/${account.uuid}`, {
    method: "PATCH",
    body: {
      roleUuid: role.uuid
    }
  });

  expect(updateResponse.status).toBe(200);

  return updateResponse.json();
}

async function createCompetitionType(
  actor: Account,
  input: {
    name?: string;
    championshipRules?: ChampionshipRules;
  } = {}
): Promise<CompetitionType> {
  const response = await request("/api/championships/competition-types", {
    method: "POST",
    body: {
      actorAccountUuid: actor.uuid,
      commandUuid: crypto.randomUUID(),
      slug: uniqueSlug("cup"),
      name: input.name ?? "Cup",
      cadence: "multi-day",
      defaultRules: input.championshipRules ?? rules()
    }
  });

  expect(response.status).toBe(201);

  return response.json();
}

async function createSalaryFixture(
  participantAccounts: Account[],
  input: { capUnits: number }
) {
  const type = await createCompetitionType(admin, {
    name: "Salary Cup",
    championshipRules: rules({
      salaryEnabled: true,
      capUnits: input.capUnits
    })
  });
  let championship = await createChampionship(admin, type, {
    name: "Salary Management Cup"
  });
  const teamResponse = await request(
    `/api/championships/${championship.uuid}/teams`,
    {
      method: "POST",
      body: command(admin, championship.revision, {
        name: "Salary Team"
      })
    }
  );

  expect(teamResponse.status).toBe(201);
  const team = await teamResponse.json();
  championship = await getChampionship(championship.uuid);

  const openResponse = await request(
    `/api/championships/${championship.uuid}/registration/transitions`,
    {
      method: "POST",
      body: command(admin, championship.revision, { operation: "open" })
    }
  );

  expect(openResponse.status).toBe(200);
  championship = await openResponse.json();

  const participants = [];

  for (const account of participantAccounts) {
    const response = await request(
      `/api/championships/${championship.uuid}/registrations/self`,
      {
        method: "POST",
        body: command(account, championship.revision, {})
      }
    );

    expect(response.status).toBe(201);
    participants.push(await response.json());
    championship = await getChampionship(championship.uuid);
  }

  return {
    championship,
    participants,
    teams: [team]
  };
}

async function createFrozenSalaryFixture(
  participantAccounts: Account[],
  input: { capUnits: number; prices: number[] }
) {
  const fixture = await createSalaryFixture(participantAccounts, input);
  let championship = fixture.championship;
  const priceResponse = await request(
    `/api/championships/${championship.uuid}/salary/prices`,
    {
      method: "PUT",
      body: command(admin, championship.revision, {
        prices: fixture.participants.map(
          (participant: { uuid: string }, index: number) => ({
            participantId: participant.uuid,
            priceUnits: input.prices[index]
          })
        )
      })
    }
  );

  expect(priceResponse.status).toBe(200);
  championship = await getChampionship(championship.uuid);

  const closeResponse = await request(
    `/api/championships/${championship.uuid}/registration/transitions`,
    {
      method: "POST",
      body: command(admin, championship.revision, { operation: "close" })
    }
  );

  expect(closeResponse.status).toBe(200);
  championship = await closeResponse.json();

  const freezeResponse = await request(
    `/api/championships/${championship.uuid}/salary/prices/freeze`,
    {
      method: "POST",
      body: command(admin, championship.revision, {})
    }
  );

  expect(freezeResponse.status).toBe(200);
  championship = await getChampionship(championship.uuid);

  return {
    ...fixture,
    championship
  };
}

async function createChampionship(
  actor: Account,
  type: CompetitionType,
  input: {
    name: string;
    historical?: boolean;
    createCompleted?: boolean;
    roomProgramIds?: string[];
    defaultRoomProgramId?: string;
  }
): Promise<Championship> {
  const response = await request("/api/championships", {
    method: "POST",
    body: {
      actorAccountUuid: actor.uuid,
      commandUuid: crypto.randomUUID(),
      competitionTypeId: type.uuid,
      slug: uniqueSlug("championship"),
      ...input
    }
  });

  expect(response.status).toBe(201);

  return response.json();
}

async function getChampionship(uuid: string): Promise<Championship> {
  const response = await request(`/api/championships/${uuid}`);

  expect(response.status).toBe(200);

  return response.json();
}

async function createRoomProgram(prefix: string) {
  const response = await request("/api/room-programs", {
    method: "POST",
    body: {
      name: `${prefix}-${crypto.randomUUID().slice(0, 8)}`,
      title: prefix,
      releaseSource: {
        owner: "haxbrasil",
        repo: "test-room",
        assetPattern: "room-{tag}.tgz"
      },
      integrationMode: "external"
    }
  });

  expect(response.status).toBe(201);

  const program = await response.json();

  return {
    uuid: program.id as string
  };
}

function command(
  actor: Account,
  expectedRevision: number,
  values: Record<string, unknown>
) {
  return {
    actorAccountUuid: actor.uuid,
    commandUuid: crypto.randomUUID(),
    expectedRevision,
    ...values
  };
}

function rules(
  input: {
    matchRounds?: number;
    salaryEnabled?: boolean;
    capUnits?: number;
    maximumTradeDifference?: number;
    draftRounds?: number;
    countdownSeconds?: number;
  } = {}
) {
  return {
    match: {
      sequentialRoundCount: input.matchRounds ?? 2,
      switchSides: true,
      drawPolicy: "overtime" as const,
      overtimePolicy: "separate-period" as const,
      overtimeRuleLabel: null,
      fullForfeitScore: {
        winner: 3,
        loser: 0
      }
    },
    roster: {
      minimumSize: 0,
      maximumSize: 12,
      lockPolicy: "draft-start" as const
    },
    salary: {
      enabled: input.salaryEnabled ?? false,
      capUnits: input.capUnits ?? 0,
      displayLabel: "un.",
      maximumTradeDifference: input.maximumTradeDifference ?? 0
    },
    draft: {
      rounds: input.draftRounds ?? 3,
      countdownSeconds: input.countdownSeconds ?? 60,
      publicPrices: true
    },
    scheduling: {
      authority: "staff-and-gms" as const,
      proposalMode: "both" as const,
      latePlayPolicy: "staff-approval" as const
    }
  };
}

function uniqueSlug(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function uniqueExternalId(): string {
  const randomDigits = crypto
    .randomUUID()
    .replace(/\D/g, "")
    .padEnd(5, "0")
    .slice(0, 5);

  return `${Date.now()}${randomDigits}`;
}
