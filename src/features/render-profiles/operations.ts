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
  type RenderCameraCondition,
  type RenderCameraPreset,
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
  cameras: [
    {
      id: "dynamic-action",
      title: "Ação dinâmica",
      description: "Acompanha jogadores ativos e valoriza a ação.",
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
          when: 'player_avatar == "🏈" && player_active == true',
          condition: {
            combination: "all",
            clauses: [
              { field: "player_avatar", operator: "eq", value: "🏈" },
              { field: "player_active", operator: "eq", value: true }
            ]
          },
          focus: { target: "players" }
        },
        {
          when: 'player_avatar == "🔥" && player_active == true',
          condition: {
            combination: "all",
            clauses: [
              { field: "player_avatar", operator: "eq", value: "🔥" },
              { field: "player_active", operator: "eq", value: true }
            ]
          },
          focus: { target: "players" }
        },
        {
          when: "ball_speed > 0 && ball_color == #631515",
          condition: {
            combination: "all",
            clauses: [
              { field: "ball_speed", operator: "gt", value: 0 },
              { field: "ball_color", operator: "eq", value: "#631515" }
            ]
          },
          set: { ball_weight: 10 }
        }
      ]
    }
  ]
};

export function normalizeRenderProfileSettings(
  settings: RenderProfileSettings
): RenderProfileSettings {
  const legacy = settings as unknown as { camera?: RenderCameraPreset };
  const normalized = Array.isArray(settings.cameras)
    ? settings
    : !legacy.camera
      ? settings
      : {
          ...settings,
          cameras: [
            {
              ...legacy.camera,
              id: "dynamic-action",
              title: "Ação dinâmica",
              description: "Acompanha jogadores ativos e valoriza a ação."
            }
          ]
        };
  return {
    ...normalized,
    cameras: normalized.cameras.map((camera) => ({
      ...camera,
      rules: camera.rules.map((rule) => {
        const condition = rule.condition ?? legacyCondition(rule.when);
        return condition
          ? { ...rule, condition, when: conditionExpression(condition) }
          : rule;
      })
    }))
  };
}

export async function ensureDefaultRenderProfile() {
  const [existing] = await db
    .select()
    .from(renderProfileFamilies)
    .where(eq(renderProfileFamilies.name, "dynamic-action"));
  if (existing) {
    if (
      existing.title === "Ação dinâmica" &&
      existing.description ===
        "Enquadramento aproximado com foco dinâmico para clipes de qualquer proporção."
    ) {
      await db
        .update(renderProfileFamilies)
        .set({
          title: "Padrão BFL",
          description:
            "Formatos, orientações, placares e câmeras disponíveis para exportação.",
          updatedAt: new Date().toISOString()
        })
        .where(eq(renderProfileFamilies.id, existing.id));
      return { ...existing, title: "Padrão BFL" };
    }
    return existing;
  }
  const now = new Date().toISOString();
  const [family] = await db
    .insert(renderProfileFamilies)
    .values({
      name: "dynamic-action",
      title: "Padrão BFL",
      description:
        "Formatos, orientações, placares e câmeras disponíveis para exportação.",
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
  return {
    ...version,
    version: {
      ...version.version,
      settings: normalizeRenderProfileSettings(version.version.settings)
    }
  };
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
  const settings = normalizeRenderProfileSettings(input.settings);
  validateSettings(settings);
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
        settings,
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
  const settings = normalizeRenderProfileSettings(profile.draft.settings);
  validateSettings(settings);
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
      settings,
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
  cameraId: string;
  settings?: RenderProfileSettings;
}) {
  const profile = await getRenderProfileById(input.profileId);
  if (!profile?.draft) throw notFound("Render profile not found");
  const settings = normalizeRenderProfileSettings(
    input.settings ?? profile.draft.settings
  );
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
      cameraId: input.cameraId,
      renderProfileVersionId,
      renderSettings: { camera: selectedCamera(settings, input.cameraId) }
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
  return draft
    ? { ...draft, settings: normalizeRenderProfileSettings(draft.settings) }
    : null;
}
async function getLatestVersion(familyId: number) {
  const [version] = await db
    .select()
    .from(renderProfileVersions)
    .where(eq(renderProfileVersions.familyId, familyId))
    .orderBy(desc(renderProfileVersions.version))
    .limit(1);
  return version
    ? { ...version, settings: normalizeRenderProfileSettings(version.settings) }
    : null;
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
  if (!settings.cameras.length)
    throw badRequest("Adicione ao menos uma câmera");
  if (
    new Set(settings.cameras.map((camera) => camera.id)).size !==
    settings.cameras.length
  )
    throw badRequest("Cada câmera precisa ter um identificador único");
  const controls = settings.cameras.flatMap((camera) => [
    camera.zoom,
    camera.hudZoom,
    camera.scoreboardZoom,
    camera.menuZoom,
    camera.locationIndicatorZoom,
    camera.gameMessageZoom
  ]);
  if (
    controls.some(
      (value) => !Number.isFinite(value) || value <= 0 || value > 20
    )
  )
    throw badRequest("Os controles de câmera precisam estar entre 0 e 20");
  if (
    settings.cameras
      .flatMap((camera) => Object.values(camera.parameters))
      .some((value) => !Number.isFinite(value) || Math.abs(value) > 1_000_000)
  )
    throw badRequest(
      "Os parâmetros da câmera precisam ser valores numéricos válidos"
    );
  for (const rule of settings.cameras.flatMap((camera) => camera.rules)) {
    if (rule.condition) {
      if (!rule.condition.clauses.length)
        throw badRequest("Cada regra precisa ter ao menos uma condição");
      if (!rule.when || rule.when !== conditionExpression(rule.condition))
        throw badRequest(
          "A condição da regra precisa usar os campos disponíveis"
        );
    }
  }
}

function conditionExpression(condition: RenderCameraCondition) {
  const operator = {
    eq: "==",
    neq: "!=",
    gt: ">",
    gte: ">=",
    lt: "<",
    lte: "<="
  } as const;
  return condition.clauses
    .map((clause) => {
      const value =
        typeof clause.value === "string"
          ? clause.value.startsWith("#")
            ? clause.value
            : JSON.stringify(clause.value)
          : String(clause.value);
      return `${clause.field} ${operator[clause.operator]} ${value}`;
    })
    .join(condition.combination === "all" ? " && " : " || ");
}

function legacyCondition(when: string): RenderCameraCondition | undefined {
  const known: Record<string, RenderCameraCondition> = {
    'player_avatar == "🏈" && player_active': {
      combination: "all",
      clauses: [
        { field: "player_avatar", operator: "eq", value: "🏈" },
        { field: "player_active", operator: "eq", value: true }
      ]
    },
    'player_avatar == "🔥" && player_active': {
      combination: "all",
      clauses: [
        { field: "player_avatar", operator: "eq", value: "🔥" },
        { field: "player_active", operator: "eq", value: true }
      ]
    },
    "ball_speed > 0 && ball_color == #631515": {
      combination: "all",
      clauses: [
        { field: "ball_speed", operator: "gt", value: 0 },
        { field: "ball_color", operator: "eq", value: "#631515" }
      ]
    }
  };
  return known[when];
}

function selectedCamera(settings: RenderProfileSettings, cameraId: string) {
  const camera = settings.cameras.find(
    (candidate) => candidate.id === cameraId
  );
  if (!camera)
    throw badRequest("A câmera escolhida não pertence a este perfil");
  return camera;
}
