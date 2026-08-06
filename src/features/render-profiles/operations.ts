import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { badRequest, notFound } from "@/shared/http/errors";
import { getClipRow } from "@/features/clips/_shared/db/queries";
import { enqueueClipExport } from "@/features/media-renditions/_shared/domain/jobs";
import { toClipExportResponse } from "@/features/clips/_shared/http/responses";
import { sha256Hex } from "@/shared/crypto/sha256";
import {
  renderProfileDrafts,
  renderProfileFamilies,
  renderProfileVersions,
  type RenderProfileSettings
} from "@/features/render-profiles/db";

const scoreboards = [
  "default",
  "compact",
  "score-only",
  "time-only",
  "floating-default",
  "floating-compact",
  "floating-score-only",
  "floating-time-only",
  "floating-score-time-right",
  "none"
];
const formats = ["mp4", "webm", "gif"] as const;
const orientations = ["landscape", "vertical"] as const;
export const defaultRenderProfileSettings: RenderProfileSettings = {
  formats: [...formats],
  orientations: [...orientations],
  scoreboards,
  camera: {
    zoom: 3.2,
    hudZoom: 2,
    scoreboardZoom: 2,
    menuZoom: 2,
    locationIndicatorZoom: 2,
    gameMessageZoom: 1,
    parameters: {
      player_weight: 1,
      ball_weight: 0,
      ball_speed_min: 0.1,
      ball_speed_max: 4,
      ball_lookahead_frames: 14,
      ball_lookahead_max: 140,
      outlier_distance: 280,
      outlier_power: 1,
      outside_field_penalty: 5,
      deadzone: 4,
      deadzone_full: 35,
      smoothing: 0.955
    },
    rules: [
      {
        when: 'player_avatar == "🏈" && player_active',
        focus: { target: "players" }
      },
      {
        when: 'player_avatar == "🔥" && player_active',
        focus: { target: "players" }
      },
      {
        when: "ball_speed > 0 && ball_color == #631515",
        set: { ball_weight: 10 }
      }
    ]
  }
};

export async function ensureDefaultRenderProfile() {
  const [existing] = await db
    .select()
    .from(renderProfileFamilies)
    .where(eq(renderProfileFamilies.name, "dynamic-action"));
  if (existing) return existing;
  const now = new Date().toISOString();
  const [family] = await db
    .insert(renderProfileFamilies)
    .values({
      name: "dynamic-action",
      title: "Ação dinâmica",
      description:
        "Enquadramento aproximado com foco dinâmico para clipes de qualquer proporção.",
      createdAt: now,
      updatedAt: now
    })
    .returning();
  await db.insert(renderProfileDrafts).values({
    familyId: family.id,
    settings: defaultRenderProfileSettings,
    updatedAt: now
  });
  await db.insert(renderProfileVersions).values({
    familyId: family.id,
    version: 1,
    settings: defaultRenderProfileSettings,
    createdAt: now
  });
  return family;
}

export async function listRenderProfiles() {
  await ensureDefaultRenderProfile();
  const families = await db
    .select()
    .from(renderProfileFamilies)
    .orderBy(asc(renderProfileFamilies.title));
  return Promise.all(
    families.map(async (family) => ({
      ...family,
      draft: await getDraft(family.id),
      latestVersion: await getLatestVersion(family.id)
    }))
  );
}

export async function getRenderProfileVersion(uuid: string) {
  const [version] = await db
    .select({ version: renderProfileVersions, family: renderProfileFamilies })
    .from(renderProfileVersions)
    .innerJoin(
      renderProfileFamilies,
      eq(renderProfileVersions.familyId, renderProfileFamilies.id)
    )
    .where(
      and(
        eq(renderProfileVersions.uuid, uuid),
        eq(renderProfileFamilies.state, "active")
      )
    );
  if (!version) throw notFound("Render profile not found");
  return version;
}

export async function updateRenderProfileDraft(
  id: string,
  input: {
    title: string;
    description?: string | null;
    settings: RenderProfileSettings;
    expectedRevision: number;
  }
) {
  const [family] = await db
    .select()
    .from(renderProfileFamilies)
    .where(eq(renderProfileFamilies.uuid, id));
  if (!family) throw notFound("Render profile not found");
  if (family.revision !== input.expectedRevision)
    throw badRequest("Perfil foi alterado por outra pessoa");
  validateSettings(input.settings);
  const now = new Date().toISOString();
  await db.transaction(async (tx) => {
    await tx
      .update(renderProfileFamilies)
      .set({
        title: input.title.trim(),
        description: input.description?.trim() || null,
        revision: family.revision + 1,
        updatedAt: now
      })
      .where(eq(renderProfileFamilies.id, family.id));
    await tx
      .update(renderProfileDrafts)
      .set({
        settings: input.settings,
        revision: family.revision + 1,
        updatedAt: now
      })
      .where(eq(renderProfileDrafts.familyId, family.id));
  });
  return getRenderProfileById(id);
}

export async function publishRenderProfile(
  id: string,
  expectedRevision: number
) {
  const profile = await getRenderProfileById(id);
  if (!profile || !profile.draft) throw notFound("Render profile not found");
  if (profile.revision !== expectedRevision)
    throw badRequest("Perfil foi alterado por outra pessoa");
  validateSettings(profile.draft.settings);
  const nextVersion = (profile.latestVersion?.version ?? 0) + 1;
  const now = new Date().toISOString();
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(renderProfileFamilies)
      .set({ revision: profile.revision + 1, updatedAt: now })
      .where(
        and(
          eq(renderProfileFamilies.id, profile.id),
          eq(renderProfileFamilies.revision, expectedRevision)
        )
      )
      .returning({ id: renderProfileFamilies.id });
    if (!updated.length)
      throw badRequest("Perfil foi alterado por outra pessoa");
    await tx.insert(renderProfileVersions).values({
      familyId: profile.id,
      version: nextVersion,
      settings: profile.draft.settings,
      createdAt: now
    });
  });
  return getRenderProfileById(id);
}

export async function getRenderProfileById(id: string) {
  const [family] = await db
    .select()
    .from(renderProfileFamilies)
    .where(eq(renderProfileFamilies.uuid, id));
  if (!family) return null;
  return {
    ...family,
    draft: await getDraft(family.id),
    latestVersion: await getLatestVersion(family.id)
  };
}

export async function previewRenderProfile(input: {
  profileId: string;
  clipId: string;
  format: "mp4" | "webm" | "gif";
  orientation: "landscape" | "vertical";
  scoreboard: string;
  settings?: RenderProfileSettings;
}) {
  const profile = await getRenderProfileById(input.profileId);
  if (!profile?.draft) throw notFound("Render profile not found");
  const settings = input.settings ?? profile.draft.settings;
  validateSettings(settings);
  if (
    !settings.formats.includes(input.format) ||
    !settings.orientations.includes(input.orientation) ||
    !settings.scoreboards.includes(input.scoreboard)
  ) {
    throw badRequest(
      "A configuração escolhida não está disponível neste perfil"
    );
  }
  const row = await getClipRow(input.clipId);
  if (!row) throw notFound("Clip not found");
  const settingsFingerprint = await sha256Hex(
    new TextEncoder().encode(JSON.stringify(settings))
  );
  const renderProfileVersionId = `draft-preview:${profile.uuid}:${settingsFingerprint}`;
  await enqueueClipExport({
    clip: row.clip,
    recording: row.recording,
    profile: {
      format: input.format,
      orientation: input.orientation,
      scoreboard: input.scoreboard as never,
      renderProfileVersionId,
      renderSettings: { camera: settings.camera }
    }
  });
  const refreshed = await getClipRow(input.clipId);
  const rendition = (refreshed?.renditions ?? [])
    .filter(
      (candidate) =>
        candidate.purpose === "clip_export" &&
        candidate.exportProfile?.renderProfileVersionId ===
          renderProfileVersionId &&
        candidate.exportProfile.format === input.format &&
        candidate.exportProfile.orientation === input.orientation &&
        candidate.exportProfile.scoreboard === input.scoreboard
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  if (!rendition)
    throw new Error("Render profile preview could not be created");
  return toClipExportResponse(rendition);
}

async function getDraft(familyId: number) {
  const [draft] = await db
    .select()
    .from(renderProfileDrafts)
    .where(eq(renderProfileDrafts.familyId, familyId));
  return draft ?? null;
}
async function getLatestVersion(familyId: number) {
  const [version] = await db
    .select()
    .from(renderProfileVersions)
    .where(eq(renderProfileVersions.familyId, familyId))
    .orderBy(desc(renderProfileVersions.version))
    .limit(1);
  return version ?? null;
}

export function validateSettings(settings: RenderProfileSettings) {
  if (
    !settings.formats.length ||
    settings.formats.some((format) => !formats.includes(format))
  )
    throw badRequest("Selecione ao menos um formato disponível");
  if (
    !settings.orientations.length ||
    settings.orientations.some(
      (orientation) => !orientations.includes(orientation)
    )
  )
    throw badRequest("Selecione ao menos uma orientação disponível");
  if (
    !settings.scoreboards.length ||
    settings.scoreboards.some((style) => !scoreboards.includes(style))
  )
    throw badRequest("Selecione ao menos um estilo de placar");
  const numbers = [
    settings.camera.zoom,
    settings.camera.hudZoom,
    settings.camera.scoreboardZoom,
    settings.camera.menuZoom,
    settings.camera.locationIndicatorZoom,
    settings.camera.gameMessageZoom,
    ...Object.values(settings.camera.parameters)
  ];
  if (
    numbers.some((value) => !Number.isFinite(value) || value <= 0 || value > 20)
  )
    throw badRequest("Os controles de câmera precisam estar entre 0 e 20");
}
