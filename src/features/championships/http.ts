import { Elysia, t } from "elysia";
import {
  championshipAssignmentResponseSchema,
  championshipAuditEventResponseSchema,
  championshipCommentResponseSchema,
  championshipCompetitionTypeResponseSchema,
  championshipDetailResponseSchema,
  championshipDraftCorrectionPreviewResponseSchema,
  championshipDraftResponseSchema,
  championshipDoubleEliminationPreviewResponseSchema,
  championshipFormatResponseSchema,
  championshipSpotPlacementPreviewResponseSchema,
  championshipStandingsResponseSchema,
  championshipRoundRobinPreviewResponseSchema,
  championshipInboxItemResponseSchema,
  championshipMatchSchedulingResponseSchema,
  championshipParticipantResponseSchema,
  championshipPresenceResponseSchema,
  championshipRosterMembershipResponseSchema,
  championshipRosterMovePreviewResponseSchema,
  championshipRosterOrderResponseSchema,
  championshipSalaryProjectionResponseSchema,
  championshipSelfRegistrationResponseSchema,
  championshipSavedViewResponseSchema,
  championshipSummaryResponseSchema,
  championshipTeamIdentityResponseSchema,
  championshipTeamResponseSchema,
  championshipTradeResponseSchema,
  championshipThreadResponseSchema,
  listChampionshipAssignmentsResponseSchema,
  listChampionshipAuditResponseSchema,
  listChampionshipCommentsResponseSchema,
  listChampionshipInboxResponseSchema,
  listChampionshipSavedViewsResponseSchema,
  listChampionshipParticipantsResponseSchema,
  listChampionshipRosterHistoryResponseSchema,
  listChampionshipTeamsResponseSchema,
  listChampionshipThreadsResponseSchema,
  listChampionshipTradesResponseSchema,
  listChampionshipsResponseSchema,
  listCompetitionTypesResponseSchema,
  listTeamIdentitiesResponseSchema
} from "@/features/championships/_shared/http/responses";
import {
  addChampionshipCommentBodySchema,
  championshipAssignmentIdParamsSchema,
  cancelChampionshipDraftBodySchema,
  championshipCollaborationQuerySchema,
  championshipCompetitionTypeIdParamsSchema,
  championshipDraftCorrectionPreviewQuerySchema,
  championshipDraftQuerySchema,
  championshipDraftTurnIdParamsSchema,
  championshipEventsQuerySchema,
  championshipIdParamsSchema,
  championshipInboxQuerySchema,
  championshipInboxItemIdParamsSchema,
  championshipParticipantIdParamsSchema,
  championshipSavedViewsQuerySchema,
  listChampionshipParticipantsQuerySchema,
  championshipPresenceBodySchema,
  championshipPresenceQuerySchema,
  championshipRosterHistoryQuerySchema,
  championshipSalaryAdminQuerySchema,
  championshipSalaryQuerySchema,
  championshipSelfRegistrationQuerySchema,
  championshipTeamIdParamsSchema,
  championshipTeamIdentityIdParamsSchema,
  championshipTradeIdParamsSchema,
  championshipThreadIdParamsSchema,
  createChampionshipAssignmentBodySchema,
  createChampionshipBodySchema,
  createChampionshipParticipantBodySchema,
  createChampionshipTeamBodySchema,
  createChampionshipThreadBodySchema,
  createChampionshipTradeBodySchema,
  createCompetitionTypeBodySchema,
  createTeamIdentityBodySchema,
  executeChampionshipRosterMoveBodySchema,
  reorderChampionshipRosterBodySchema,
  endChampionshipDraftBodySchema,
  freezeChampionshipPricesBodySchema,
  listChampionshipAuditQuerySchema,
  listChampionshipsQuerySchema,
  listChampionshipTradesQuerySchema,
  listCompetitionTypesQuerySchema,
  transitionChampionshipBodySchema,
  transitionChampionshipRegistrationBodySchema,
  updateChampionshipAssignmentBodySchema,
  updateChampionshipBodySchema,
  updateChampionshipGrantBodySchema,
  updateChampionshipRoomProgramBodySchema,
  updateChampionshipTeamBodySchema,
  updateChampionshipParticipantBodySchema,
  updateChampionshipThreadBodySchema,
  updateChampionshipInboxItemBodySchema,
  upsertChampionshipSavedViewBodySchema,
  upsertChampionshipPricesBodySchema,
  previewChampionshipRosterMoveBodySchema,
  configureChampionshipDraftBodySchema,
  makeChampionshipDraftPickBodySchema,
  selfRegisterChampionshipBodySchema,
  startChampionshipDraftBodySchema,
  withdrawChampionshipRegistrationBodySchema,
  voidChampionshipDraftPickBodySchema,
  decideChampionshipTradeBodySchema,
  championshipFormatQuerySchema,
  championshipMatchIdParamsSchema,
  championshipLateAuthorizationIdParamsSchema,
  championshipScheduleProposalIdParamsSchema,
  championshipRouteIdParamsSchema,
  championshipSpotIdParamsSchema,
  championshipStageIdParamsSchema,
  championshipGroupIdParamsSchema,
  championshipStandingsQuerySchema,
  createChampionshipGroupBodySchema,
  configureChampionshipStandingsBodySchema,
  previewChampionshipRoundRobinBodySchema,
  generateChampionshipRoundRobinBodySchema,
  previewChampionshipClassificationBodySchema,
  applyChampionshipClassificationBodySchema,
  createChampionshipCompetitionRoundBodySchema,
  createChampionshipMatchBodySchema,
  createChampionshipRouteBodySchema,
  createChampionshipSpotBodySchema,
  createChampionshipStageBodySchema,
  deleteChampionshipStageBodySchema,
  createChampionshipScheduleProposalBodySchema,
  decideChampionshipScheduleProposalBodySchema,
  authorizeChampionshipLatePlayBodySchema,
  revokeChampionshipLatePlayBodySchema,
  remindChampionshipScheduleBodySchema,
  championshipMatchSchedulingQuerySchema,
  generateSingleEliminationBodySchema,
  generateDoubleEliminationBodySchema,
  placeChampionshipSpotBodySchema,
  previewChampionshipSpotPlacementBodySchema,
  previewDoubleEliminationBodySchema,
  scheduleChampionshipMatchBodySchema,
  updateChampionshipRouteBodySchema,
  updateChampionshipStageBodySchema,
  updateTeamIdentityBodySchema,
  updateCompetitionTypeBodySchema
} from "@/features/championships/_shared/http/inputs";
import {
  createCompetitionType,
  listCompetitionTypes,
  updateCompetitionType
} from "@/features/championships/core/catalog";
import {
  createChampionship,
  listChampionships,
  transitionChampionship,
  updateChampionship
} from "@/features/championships/core/championships";
import {
  updateChampionshipGrant,
  updateChampionshipRoomProgram
} from "@/features/championships/core/administration";
import {
  createChampionshipEventStream,
  listChampionshipAuditEvents
} from "@/features/championships/core/activity";
import { getChampionshipDetail } from "@/features/championships/_shared/db/queries";
import {
  addChampionshipComment,
  createChampionshipAssignment,
  createChampionshipThread,
  heartbeatChampionshipPresence,
  listChampionshipAssignments,
  listChampionshipComments,
  listChampionshipInbox,
  listChampionshipSavedViews,
  listChampionshipPresence,
  listChampionshipThreads,
  updateChampionshipAssignment,
  updateChampionshipInboxItem,
  upsertChampionshipSavedView,
  updateChampionshipThread
} from "@/features/championships/collaboration/operations";
import {
  createChampionshipTeam,
  createTeamIdentity,
  listTeamIdentities,
  updateChampionshipTeam,
  updateTeamIdentity
} from "@/features/championships/people/operations";
import {
  listChampionshipParticipants,
  listChampionshipTeams
} from "@/features/championships/people/projections";
import {
  createChampionshipParticipant,
  getSelfChampionshipRegistration,
  selfRegisterChampionship,
  transitionChampionshipRegistration,
  updateChampionshipParticipant,
  withdrawChampionshipRegistration
} from "@/features/championships/people/registration";
import {
  executeChampionshipRosterMove,
  listChampionshipRosterHistory,
  previewChampionshipRosterMove,
  reorderChampionshipRoster
} from "@/features/championships/people/rosters";
import {
  freezeChampionshipPrices,
  upsertChampionshipPrices
} from "@/features/championships/finance/operations";
import {
  getAdminChampionshipSalaryProjection,
  getPublicChampionshipSalaryProjection
} from "@/features/championships/finance/projections";
import {
  configureChampionshipDraft,
  cancelChampionshipDraft,
  endChampionshipDraft,
  getChampionshipDraft,
  getChampionshipDraftCorrectionPreview,
  makeChampionshipDraftPick,
  startChampionshipDraft,
  voidChampionshipDraftPick
} from "@/features/championships/draft-trades/draft";
import {
  acceptChampionshipTrade,
  cancelChampionshipTrade,
  createChampionshipTrade,
  listChampionshipTrades,
  rejectChampionshipTrade
} from "@/features/championships/draft-trades/trades";
import {
  createChampionshipCompetitionRound,
  createChampionshipMatch,
  createChampionshipRoute,
  createChampionshipSpot,
  createChampionshipStage,
  deleteChampionshipStage,
  generateDoubleElimination,
  generateSingleElimination,
  getChampionshipFormat,
  placeChampionshipSpot,
  previewChampionshipSpotPlacement,
  previewDoubleElimination,
  scheduleChampionshipMatch,
  updateChampionshipRoute,
  updateChampionshipStage
} from "@/features/championships/format-scheduling/operations";
import {
  applyChampionshipClassification,
  configureChampionshipStandings,
  createChampionshipGroup,
  generateChampionshipRoundRobin,
  getChampionshipStandings,
  previewChampionshipClassification,
  previewChampionshipRoundRobin
} from "@/features/championships/format-scheduling/standings";
import {
  authorizeChampionshipLatePlay,
  createChampionshipScheduleProposal,
  decideChampionshipScheduleProposal,
  getChampionshipMatchScheduling,
  remindChampionshipSchedule,
  revokeChampionshipLatePlay
} from "@/features/championships/format-scheduling/scheduling";
import {
  attachChampionshipMatchEvidence,
  detachChampionshipMatchEvidence,
  getChampionshipMatchOperations,
  listChampionshipEvidenceCandidates
} from "@/features/championships/matches-statistics/evidence";
import {
  attachChampionshipMatchEvidenceBodySchema,
  championshipEvidenceCandidatesQuerySchema,
  championshipMetricMappingsQuerySchema,
  championshipMatchOperationsParamsSchema,
  championshipMatchOperationsQuerySchema,
  championshipStatisticsQuerySchema,
  detachChampionshipMatchEvidenceBodySchema,
  previewChampionshipSettlementBodySchema,
  replaceChampionshipMetricMappingsBodySchema,
  settleChampionshipMatchBodySchema,
  updateChampionshipAttributionsBodySchema
} from "@/features/championships/matches-statistics/inputs";
import {
  championshipEvidenceCandidatesResponseSchema,
  championshipMatchOperationsResponseSchema,
  championshipMetricMappingsResponseSchema,
  championshipSettlementPreviewResponseSchema,
  championshipStatisticsResponseSchema
} from "@/features/championships/matches-statistics/responses";
import {
  listChampionshipMetricMappings,
  replaceChampionshipMetricMappings
} from "@/features/championships/matches-statistics/metric-mappings";
import {
  previewChampionshipMatchSettlement,
  settleChampionshipMatch,
  updateChampionshipMatchAttributions
} from "@/features/championships/matches-statistics/settlement";
import { getChampionshipStatistics } from "@/features/championships/matches-statistics/statistics";
import {
  accountChampionshipHistoryResponseSchema,
  championshipAwardIdParamsSchema,
  championshipAwardResponseSchema,
  championshipHistoryQuerySchema,
  championshipHistoryResponseSchema,
  championshipHistoricalImportBatchIdParamsSchema,
  championshipHistoricalImportBatchResponseSchema,
  championshipHistoricalImportsQuerySchema,
  championshipHistoricalPlayerIdParamsSchema,
  championshipHistoricalPlayerResponseSchema,
  championshipHonorDefinitionIdParamsSchema,
  championshipHonorDefinitionResponseSchema,
  championshipHonorGrantIdParamsSchema,
  championshipHonorIdParamsSchema,
  championshipHonorResponseSchema,
  championshipHonorResolutionPreviewResponseSchema,
  championshipHonorsQuerySchema,
  createChampionshipAwardBodySchema,
  createChampionshipHonorBodySchema,
  createChampionshipHonorDefinitionBodySchema,
  createChampionshipHonorGrantBodySchema,
  archiveChampionshipHonorDefinitionBodySchema,
  applyChampionshipHistoricalImportBodySchema,
  linkChampionshipHistoricalPlayerBodySchema,
  listChampionshipHistoricalImportsResponseSchema,
  listChampionshipHonorDefinitionsQuerySchema,
  listChampionshipHonorDefinitionsResponseSchema,
  listChampionshipHonorsResponseSchema,
  publishChampionshipHonorDefinitionBodySchema,
  previewChampionshipHistoricalImportBodySchema,
  replaceChampionshipPlacementsBodySchema,
  reorderChampionshipHonorsBodySchema,
  rollbackChampionshipHistoricalImportBodySchema,
  teamIdentityHistoryResponseSchema,
  updateChampionshipHonorBodySchema,
  updateChampionshipHonorDefinitionDraftBodySchema,
  revokeChampionshipHonorGrantBodySchema,
  resolveChampionshipHonorBodySchema,
  updateChampionshipAwardBodySchema
} from "@/features/championships/history/contracts";
import {
  createChampionshipAward,
  getAccountChampionshipHistory,
  getChampionshipHistory,
  getTeamIdentityHistory,
  replaceChampionshipPlacements,
  updateChampionshipAward
} from "@/features/championships/history/operations";
import {
  archiveChampionshipHonorDefinition,
  createChampionshipHonor,
  createChampionshipHonorDefinition,
  createChampionshipHonorGrant,
  listChampionshipHonorDefinitions,
  listChampionshipHonors,
  previewChampionshipHonorResolution,
  publishChampionshipHonorDefinition,
  revokeChampionshipHonorGrant,
  resolveChampionshipHonor,
  reorderChampionshipHonors,
  updateChampionshipHonor,
  updateChampionshipHonorDefinitionDraft
} from "@/features/championships/history/honors";
import {
  applyChampionshipHistoricalImport,
  getChampionshipHistoricalImport,
  linkChampionshipHistoricalPlayer,
  listChampionshipHistoricalImports,
  previewChampionshipHistoricalImport,
  rollbackChampionshipHistoricalImport
} from "@/features/championships/history/imports";
import { paginationQuerySchema } from "@lib";

export const championshipRoutes = new Elysia({
  name: "championship-routes",
  prefix: "/championships"
})
  .model({
    Championship: championshipSummaryResponseSchema,
    ChampionshipAssignment: championshipAssignmentResponseSchema,
    ChampionshipDetail: championshipDetailResponseSchema,
    ChampionshipAuditEvent: championshipAuditEventResponseSchema,
    ChampionshipComment: championshipCommentResponseSchema,
    ChampionshipCompetitionType: championshipCompetitionTypeResponseSchema,
    ChampionshipDraft: championshipDraftResponseSchema,
    ChampionshipDraftCorrectionPreview:
      championshipDraftCorrectionPreviewResponseSchema,
    ChampionshipFormat: championshipFormatResponseSchema,
    ChampionshipStandings: championshipStandingsResponseSchema,
    ChampionshipRoundRobinPreview: championshipRoundRobinPreviewResponseSchema,
    ChampionshipEvidenceCandidates:
      championshipEvidenceCandidatesResponseSchema,
    ChampionshipMatchOperations: championshipMatchOperationsResponseSchema,
    ChampionshipMetricMappings: championshipMetricMappingsResponseSchema,
    ChampionshipSettlementPreview: championshipSettlementPreviewResponseSchema,
    ChampionshipStatistics: championshipStatisticsResponseSchema,
    ChampionshipHistory: championshipHistoryResponseSchema,
    ChampionshipHistoricalImportBatch:
      championshipHistoricalImportBatchResponseSchema,
    ChampionshipHistoricalPlayer: championshipHistoricalPlayerResponseSchema,
    ListChampionshipHistoricalImports:
      listChampionshipHistoricalImportsResponseSchema,
    ChampionshipAward: championshipAwardResponseSchema,
    ChampionshipHonorDefinition: championshipHonorDefinitionResponseSchema,
    ListChampionshipHonorDefinitions:
      listChampionshipHonorDefinitionsResponseSchema,
    ChampionshipHonor: championshipHonorResponseSchema,
    ChampionshipHonorResolutionPreview:
      championshipHonorResolutionPreviewResponseSchema,
    ListChampionshipHonors: listChampionshipHonorsResponseSchema,
    TeamIdentityHistory: teamIdentityHistoryResponseSchema,
    AccountChampionshipHistory: accountChampionshipHistoryResponseSchema,
    ChampionshipInboxItem: championshipInboxItemResponseSchema,
    ChampionshipMatchScheduling: championshipMatchSchedulingResponseSchema,
    ChampionshipParticipant: championshipParticipantResponseSchema,
    ChampionshipPresence: championshipPresenceResponseSchema,
    ChampionshipRosterMembership: championshipRosterMembershipResponseSchema,
    ChampionshipRosterMovePreview: championshipRosterMovePreviewResponseSchema,
    ChampionshipRosterOrder: championshipRosterOrderResponseSchema,
    ChampionshipSalaryProjection: championshipSalaryProjectionResponseSchema,
    ChampionshipSelfRegistration: championshipSelfRegistrationResponseSchema,
    ChampionshipSavedView: championshipSavedViewResponseSchema,
    ChampionshipTeam: championshipTeamResponseSchema,
    ChampionshipTeamIdentity: championshipTeamIdentityResponseSchema,
    ChampionshipTrade: championshipTradeResponseSchema,
    ChampionshipThread: championshipThreadResponseSchema,
    CreateChampionshipAssignmentBody: createChampionshipAssignmentBodySchema,
    CreateChampionshipBody: createChampionshipBodySchema,
    CreateChampionshipParticipantBody: createChampionshipParticipantBodySchema,
    CreateChampionshipTeamBody: createChampionshipTeamBodySchema,
    CreateChampionshipThreadBody: createChampionshipThreadBodySchema,
    CreateChampionshipTradeBody: createChampionshipTradeBodySchema,
    CreateChampionshipCompetitionRoundBody:
      createChampionshipCompetitionRoundBodySchema,
    CreateChampionshipMatchBody: createChampionshipMatchBodySchema,
    CreateChampionshipRouteBody: createChampionshipRouteBodySchema,
    CreateChampionshipSpotBody: createChampionshipSpotBodySchema,
    CreateChampionshipStageBody: createChampionshipStageBodySchema,
    DeleteChampionshipStageBody: deleteChampionshipStageBodySchema,
    CreateChampionshipGroupBody: createChampionshipGroupBodySchema,
    ConfigureChampionshipStandingsBody:
      configureChampionshipStandingsBodySchema,
    PreviewChampionshipRoundRobinBody: previewChampionshipRoundRobinBodySchema,
    GenerateChampionshipRoundRobinBody:
      generateChampionshipRoundRobinBodySchema,
    PreviewChampionshipClassificationBody:
      previewChampionshipClassificationBodySchema,
    ApplyChampionshipClassificationBody:
      applyChampionshipClassificationBodySchema,
    CreateChampionshipScheduleProposalBody:
      createChampionshipScheduleProposalBodySchema,
    DecideChampionshipScheduleProposalBody:
      decideChampionshipScheduleProposalBodySchema,
    AuthorizeChampionshipLatePlayBody: authorizeChampionshipLatePlayBodySchema,
    RevokeChampionshipLatePlayBody: revokeChampionshipLatePlayBodySchema,
    RemindChampionshipScheduleBody: remindChampionshipScheduleBodySchema,
    CreateCompetitionTypeBody: createCompetitionTypeBodySchema,
    CreateTeamIdentityBody: createTeamIdentityBodySchema,
    ExecuteChampionshipRosterMoveBody: executeChampionshipRosterMoveBodySchema,
    ReorderChampionshipRosterBody: reorderChampionshipRosterBodySchema,
    EndChampionshipDraftBody: endChampionshipDraftBodySchema,
    CancelChampionshipDraftBody: cancelChampionshipDraftBodySchema,
    FreezeChampionshipPricesBody: freezeChampionshipPricesBodySchema,
    AddChampionshipCommentBody: addChampionshipCommentBodySchema,
    ListChampionshipAssignments: listChampionshipAssignmentsResponseSchema,
    ListChampionshipAudit: listChampionshipAuditResponseSchema,
    ListChampionshipComments: listChampionshipCommentsResponseSchema,
    ListChampionshipInbox: listChampionshipInboxResponseSchema,
    ListChampionshipSavedViews: listChampionshipSavedViewsResponseSchema,
    ListChampionshipParticipants: listChampionshipParticipantsResponseSchema,
    ListChampionshipRosterHistory: listChampionshipRosterHistoryResponseSchema,
    ListChampionshipTeams: listChampionshipTeamsResponseSchema,
    ListChampionshipThreads: listChampionshipThreadsResponseSchema,
    ListChampionshipTrades: listChampionshipTradesResponseSchema,
    ListChampionships: listChampionshipsResponseSchema,
    ListCompetitionTypes: listCompetitionTypesResponseSchema,
    ListTeamIdentities: listTeamIdentitiesResponseSchema,
    UpdateChampionshipAssignmentBody: updateChampionshipAssignmentBodySchema,
    TransitionChampionshipBody: transitionChampionshipBodySchema,
    TransitionChampionshipRegistrationBody:
      transitionChampionshipRegistrationBodySchema,
    UpdateChampionshipBody: updateChampionshipBodySchema,
    UpdateChampionshipGrantBody: updateChampionshipGrantBodySchema,
    UpdateChampionshipRoomProgramBody: updateChampionshipRoomProgramBodySchema,
    UpdateChampionshipTeamBody: updateChampionshipTeamBodySchema,
    UpdateChampionshipParticipantBody: updateChampionshipParticipantBodySchema,
    UpdateChampionshipThreadBody: updateChampionshipThreadBodySchema,
    UpdateChampionshipInboxItemBody: updateChampionshipInboxItemBodySchema,
    UpsertChampionshipSavedViewBody: upsertChampionshipSavedViewBodySchema,
    UpsertChampionshipPricesBody: upsertChampionshipPricesBodySchema,
    PreviewChampionshipRosterMoveBody: previewChampionshipRosterMoveBodySchema,
    ConfigureChampionshipDraftBody: configureChampionshipDraftBodySchema,
    MakeChampionshipDraftPickBody: makeChampionshipDraftPickBodySchema,
    SelfRegisterChampionshipBody: selfRegisterChampionshipBodySchema,
    StartChampionshipDraftBody: startChampionshipDraftBodySchema,
    WithdrawChampionshipRegistrationBody:
      withdrawChampionshipRegistrationBodySchema,
    VoidChampionshipDraftPickBody: voidChampionshipDraftPickBodySchema,
    DecideChampionshipTradeBody: decideChampionshipTradeBodySchema,
    GenerateSingleEliminationBody: generateSingleEliminationBodySchema,
    GenerateDoubleEliminationBody: generateDoubleEliminationBodySchema,
    PreviewDoubleEliminationBody: previewDoubleEliminationBodySchema,
    ChampionshipDoubleEliminationPreview:
      championshipDoubleEliminationPreviewResponseSchema,
    AttachChampionshipMatchEvidenceBody:
      attachChampionshipMatchEvidenceBodySchema,
    DetachChampionshipMatchEvidenceBody:
      detachChampionshipMatchEvidenceBodySchema,
    PlaceChampionshipSpotBody: placeChampionshipSpotBodySchema,
    PreviewChampionshipSpotPlacementBody:
      previewChampionshipSpotPlacementBodySchema,
    ChampionshipSpotPlacementPreview:
      championshipSpotPlacementPreviewResponseSchema,
    PreviewChampionshipSettlementBody: previewChampionshipSettlementBodySchema,
    ReplaceChampionshipMetricMappingsBody:
      replaceChampionshipMetricMappingsBodySchema,
    ScheduleChampionshipMatchBody: scheduleChampionshipMatchBodySchema,
    SettleChampionshipMatchBody: settleChampionshipMatchBodySchema,
    UpdateChampionshipRouteBody: updateChampionshipRouteBodySchema,
    UpdateChampionshipStageBody: updateChampionshipStageBodySchema,
    UpdateChampionshipAttributionsBody:
      updateChampionshipAttributionsBodySchema,
    UpdateTeamIdentityBody: updateTeamIdentityBodySchema,
    UpdateCompetitionTypeBody: updateCompetitionTypeBodySchema,
    CreateChampionshipAwardBody: createChampionshipAwardBodySchema,
    CreateChampionshipHonorDefinitionBody:
      createChampionshipHonorDefinitionBodySchema,
    UpdateChampionshipHonorDefinitionDraftBody:
      updateChampionshipHonorDefinitionDraftBodySchema,
    PublishChampionshipHonorDefinitionBody:
      publishChampionshipHonorDefinitionBodySchema,
    ArchiveChampionshipHonorDefinitionBody:
      archiveChampionshipHonorDefinitionBodySchema,
    CreateChampionshipHonorBody: createChampionshipHonorBodySchema,
    UpdateChampionshipHonorBody: updateChampionshipHonorBodySchema,
    ReorderChampionshipHonorsBody: reorderChampionshipHonorsBodySchema,
    CreateChampionshipHonorGrantBody: createChampionshipHonorGrantBodySchema,
    RevokeChampionshipHonorGrantBody: revokeChampionshipHonorGrantBodySchema,
    ResolveChampionshipHonorBody: resolveChampionshipHonorBodySchema,
    ReplaceChampionshipPlacementsBody: replaceChampionshipPlacementsBodySchema,
    PreviewChampionshipHistoricalImportBody:
      previewChampionshipHistoricalImportBodySchema,
    ApplyChampionshipHistoricalImportBody:
      applyChampionshipHistoricalImportBodySchema,
    RollbackChampionshipHistoricalImportBody:
      rollbackChampionshipHistoricalImportBodySchema,
    LinkChampionshipHistoricalPlayerBody:
      linkChampionshipHistoricalPlayerBodySchema,
    UpdateChampionshipAwardBody: updateChampionshipAwardBodySchema
  })
  .get("/competition-types", ({ query }) => listCompetitionTypes(query), {
    query: listCompetitionTypesQuerySchema,
    response: { 200: t.Ref("ListCompetitionTypes") },
    detail: {
      tags: ["Championships"],
      summary: "List championship competition types"
    }
  })
  .get(
    "/honor-definitions",
    ({ query }) => listChampionshipHonorDefinitions(query),
    {
      query: listChampionshipHonorDefinitionsQuerySchema,
      response: { 200: t.Ref("ListChampionshipHonorDefinitions") },
      detail: {
        tags: ["Championships"],
        summary: "List reusable championship honor definitions"
      }
    }
  )
  .post(
    "/honor-definitions",
    ({ body, set }) => {
      set.status = 201;
      return createChampionshipHonorDefinition(body);
    },
    {
      body: t.Ref("CreateChampionshipHonorDefinitionBody"),
      response: { 201: t.Ref("ChampionshipHonorDefinition") },
      detail: {
        tags: ["Championships"],
        summary: "Create a reusable championship honor definition"
      }
    }
  )
  .put(
    "/honor-definitions/:definitionId/draft",
    ({ params, body }) =>
      updateChampionshipHonorDefinitionDraft(params.definitionId, body),
    {
      params: championshipHonorDefinitionIdParamsSchema,
      body: t.Ref("UpdateChampionshipHonorDefinitionDraftBody"),
      response: { 200: t.Ref("ChampionshipHonorDefinition") },
      detail: {
        tags: ["Championships"],
        summary: "Update a championship honor definition draft"
      }
    }
  )
  .post(
    "/honor-definitions/:definitionId/publish",
    ({ params, body }) =>
      publishChampionshipHonorDefinition(params.definitionId, body),
    {
      params: championshipHonorDefinitionIdParamsSchema,
      body: t.Ref("PublishChampionshipHonorDefinitionBody"),
      response: {
        200: t.Intersect([
          t.Ref("ChampionshipHonorDefinition"),
          t.Object({ published: t.Boolean() })
        ])
      },
      detail: {
        tags: ["Championships"],
        summary: "Publish an immutable championship honor definition version"
      }
    }
  )
  .post(
    "/honor-definitions/:definitionId/archive",
    ({ params, body }) =>
      archiveChampionshipHonorDefinition(params.definitionId, body),
    {
      params: championshipHonorDefinitionIdParamsSchema,
      body: t.Ref("ArchiveChampionshipHonorDefinitionBody"),
      response: { 200: t.Ref("ChampionshipHonorDefinition") },
      detail: {
        tags: ["Championships"],
        summary: "Archive or restore a championship honor definition"
      }
    }
  )
  .post(
    "/competition-types",
    ({ body, set }) => {
      set.status = 201;

      return createCompetitionType(body);
    },
    {
      body: t.Ref("CreateCompetitionTypeBody"),
      response: { 201: t.Ref("ChampionshipCompetitionType") },
      detail: {
        tags: ["Championships"],
        summary: "Create a championship competition type"
      }
    }
  )
  .patch(
    "/competition-types/:id",
    ({ params, body }) => updateCompetitionType(params.id, body),
    {
      params: championshipCompetitionTypeIdParamsSchema,
      body: t.Ref("UpdateCompetitionTypeBody"),
      response: { 200: t.Ref("ChampionshipCompetitionType") },
      detail: {
        tags: ["Championships"],
        summary: "Update a championship competition type"
      }
    }
  )
  .get("/team-identities", ({ query }) => listTeamIdentities(query), {
    query: paginationQuerySchema,
    response: { 200: t.Ref("ListTeamIdentities") },
    detail: {
      tags: ["Championships"],
      summary: "List championship team identities"
    }
  })
  .get(
    "/team-identities/:identityId/history",
    ({ params, query }) => getTeamIdentityHistory(params.identityId, query),
    {
      params: t.Object({ identityId: t.String({ format: "uuid" }) }),
      query: championshipHistoryQuerySchema,
      response: { 200: t.Ref("TeamIdentityHistory") },
      detail: {
        tags: ["Championships"],
        summary: "Get a team identity title history"
      }
    }
  )
  .get(
    "/accounts/:accountId/history",
    ({ params, query }) =>
      getAccountChampionshipHistory(params.accountId, query),
    {
      params: t.Object({ accountId: t.String({ format: "uuid" }) }),
      query: championshipHistoryQuerySchema,
      response: { 200: t.Ref("AccountChampionshipHistory") },
      detail: {
        tags: ["Championships"],
        summary: "Get an account championship history"
      }
    }
  )
  .get("/inbox", ({ query }) => listChampionshipInbox(query), {
    query: championshipInboxQuerySchema,
    response: { 200: t.Ref("ListChampionshipInbox") },
    detail: {
      tags: ["Championships"],
      summary: "List a staff account championship inbox"
    }
  })
  .patch(
    "/inbox/:inboxItemId",
    ({ params, body }) => updateChampionshipInboxItem(params.inboxItemId, body),
    {
      params: championshipInboxItemIdParamsSchema,
      body: t.Ref("UpdateChampionshipInboxItemBody"),
      response: { 200: t.Ref("ChampionshipInboxItem") },
      detail: {
        tags: ["Championships"],
        summary: "Update a championship inbox item"
      }
    }
  )
  .get("", ({ query }) => listChampionships(query), {
    query: listChampionshipsQuerySchema,
    response: { 200: t.Ref("ListChampionships") },
    detail: {
      tags: ["Championships"],
      summary: "List championships"
    }
  })
  .post(
    "",
    ({ body, set }) => {
      set.status = 201;

      return createChampionship(body);
    },
    {
      body: t.Ref("CreateChampionshipBody"),
      response: { 201: t.Ref("ChampionshipDetail") },
      detail: {
        tags: ["Championships"],
        summary: "Create a championship"
      }
    }
  )
  .get("/:id", ({ params }) => getChampionshipDetail(params.id), {
    params: championshipIdParamsSchema,
    response: { 200: t.Ref("ChampionshipDetail") },
    detail: {
      tags: ["Championships"],
      summary: "Get a championship"
    }
  })
  .patch("/:id", ({ params, body }) => updateChampionship(params.id, body), {
    params: championshipIdParamsSchema,
    body: t.Ref("UpdateChampionshipBody"),
    response: { 200: t.Ref("ChampionshipDetail") },
    detail: {
      tags: ["Championships"],
      summary: "Update a championship"
    }
  })
  .get(
    "/:id/history",
    ({ params, query }) => getChampionshipHistory(params.id, query),
    {
      params: championshipIdParamsSchema,
      query: championshipHistoryQuerySchema,
      response: { 200: t.Ref("ChampionshipHistory") },
      detail: {
        tags: ["Championships"],
        summary: "Get championship placements, awards, and records"
      }
    }
  )
  .get(
    "/:id/honors",
    ({ params, query }) => listChampionshipHonors(params.id, query),
    {
      params: championshipIdParamsSchema,
      query: championshipHonorsQuerySchema,
      response: { 200: t.Ref("ListChampionshipHonors") },
      detail: {
        tags: ["Championships"],
        summary: "List honors in dispute and awarded in a championship"
      }
    }
  )
  .post(
    "/:id/honors",
    ({ params, body, set }) => {
      set.status = 201;
      return createChampionshipHonor(params.id, body);
    },
    {
      params: championshipIdParamsSchema,
      body: t.Ref("CreateChampionshipHonorBody"),
      response: { 201: t.Ref("ChampionshipHonor") },
      detail: {
        tags: ["Championships"],
        summary: "Add a published honor to a championship"
      }
    }
  )
  .put(
    "/:id/honors/order",
    ({ params, body }) => reorderChampionshipHonors(params.id, body),
    {
      params: championshipIdParamsSchema,
      body: t.Ref("ReorderChampionshipHonorsBody"),
      response: { 200: t.Array(t.Ref("ChampionshipHonor")) },
      detail: {
        tags: ["Championships"],
        summary: "Reorder every active honor in a championship"
      }
    }
  )
  .patch(
    "/:id/honors/:honorId",
    ({ params, body }) =>
      updateChampionshipHonor(params.id, params.honorId, body),
    {
      params: championshipHonorIdParamsSchema,
      body: t.Ref("UpdateChampionshipHonorBody"),
      response: { 200: t.Ref("ChampionshipHonor") },
      detail: {
        tags: ["Championships"],
        summary: "Update a championship honor"
      }
    }
  )
  .get(
    "/:id/honors/:honorId/resolution-preview",
    ({ params, query }) =>
      previewChampionshipHonorResolution(
        params.id,
        params.honorId,
        query.actorAccountUuid
      ),
    {
      params: championshipHonorIdParamsSchema,
      query: t.Object({
        actorAccountUuid: t.Optional(t.String({ format: "uuid" }))
      }),
      response: { 200: t.Ref("ChampionshipHonorResolutionPreview") },
      detail: {
        tags: ["Championships"],
        summary: "Preview the calculated result of a championship honor"
      }
    }
  )
  .post(
    "/:id/honors/:honorId/resolve",
    ({ params, body }) =>
      resolveChampionshipHonor(params.id, params.honorId, body),
    {
      params: championshipHonorIdParamsSchema,
      body: t.Ref("ResolveChampionshipHonorBody"),
      response: { 200: t.Ref("ChampionshipHonor") },
      detail: {
        tags: ["Championships"],
        summary: "Confirm the calculated result of a championship honor"
      }
    }
  )
  .post(
    "/:id/honors/:honorId/grants",
    ({ params, body }) =>
      createChampionshipHonorGrant(params.id, params.honorId, body),
    {
      params: championshipHonorIdParamsSchema,
      body: t.Ref("CreateChampionshipHonorGrantBody"),
      response: { 200: t.Ref("ChampionshipHonor") },
      detail: {
        tags: ["Championships"],
        summary: "Award a championship honor"
      }
    }
  )
  .post(
    "/:id/honors/:honorId/grants/:grantId/revoke",
    ({ params, body }) =>
      revokeChampionshipHonorGrant(
        params.id,
        params.honorId,
        params.grantId,
        body
      ),
    {
      params: championshipHonorGrantIdParamsSchema,
      body: t.Ref("RevokeChampionshipHonorGrantBody"),
      response: { 200: t.Ref("ChampionshipHonor") },
      detail: {
        tags: ["Championships"],
        summary: "Revoke a championship honor grant"
      }
    }
  )
  .get(
    "/:id/historical-imports",
    ({ params, query }) => listChampionshipHistoricalImports(params.id, query),
    {
      params: championshipIdParamsSchema,
      query: championshipHistoricalImportsQuerySchema,
      response: { 200: t.Ref("ListChampionshipHistoricalImports") },
      detail: {
        tags: ["Championships"],
        summary: "List historical import batches"
      }
    }
  )
  .post(
    "/:id/historical-imports/preview",
    ({ params, body, set }) => {
      set.status = 201;
      return previewChampionshipHistoricalImport(params.id, body);
    },
    {
      params: championshipIdParamsSchema,
      body: t.Ref("PreviewChampionshipHistoricalImportBody"),
      response: { 201: t.Ref("ChampionshipHistoricalImportBatch") },
      detail: {
        tags: ["Championships"],
        summary: "Parse and preview a CSV or JSON historical import"
      }
    }
  )
  .get(
    "/:id/historical-imports/:batchId",
    ({ params, query }) =>
      getChampionshipHistoricalImport(
        params.id,
        params.batchId,
        query.actorAccountUuid
      ),
    {
      params: championshipHistoricalImportBatchIdParamsSchema,
      query: t.Object({
        actorAccountUuid: t.String({ format: "uuid" })
      }),
      response: { 200: t.Ref("ChampionshipHistoricalImportBatch") },
      detail: {
        tags: ["Championships"],
        summary: "Get a historical import batch"
      }
    }
  )
  .post(
    "/:id/historical-imports/:batchId/apply",
    ({ params, body }) =>
      applyChampionshipHistoricalImport(params.id, params.batchId, body),
    {
      params: championshipHistoricalImportBatchIdParamsSchema,
      body: t.Ref("ApplyChampionshipHistoricalImportBody"),
      response: { 200: t.Ref("ChampionshipHistoricalImportBatch") },
      detail: {
        tags: ["Championships"],
        summary: "Apply all valid rows in a historical import"
      }
    }
  )
  .post(
    "/:id/historical-imports/:batchId/rollback",
    ({ params, body }) =>
      rollbackChampionshipHistoricalImport(params.id, params.batchId, body),
    {
      params: championshipHistoricalImportBatchIdParamsSchema,
      body: t.Ref("RollbackChampionshipHistoricalImportBody"),
      response: { 200: t.Ref("ChampionshipHistoricalImportBatch") },
      detail: {
        tags: ["Championships"],
        summary: "Roll back entities owned by a historical import"
      }
    }
  )
  .post(
    "/:id/historical-players/:historicalPlayerId/link",
    ({ params, body }) =>
      linkChampionshipHistoricalPlayer(
        params.id,
        params.historicalPlayerId,
        body
      ),
    {
      params: championshipHistoricalPlayerIdParamsSchema,
      body: t.Ref("LinkChampionshipHistoricalPlayerBody"),
      response: { 200: t.Ref("ChampionshipHistoricalPlayer") },
      detail: {
        tags: ["Championships"],
        summary: "Link a historical player identity to an account"
      }
    }
  )
  .put(
    "/:id/placements",
    ({ params, body }) => replaceChampionshipPlacements(params.id, body),
    {
      params: championshipIdParamsSchema,
      body: t.Ref("ReplaceChampionshipPlacementsBody"),
      response: { 200: t.Ref("ChampionshipHistory") },
      detail: {
        tags: ["Championships"],
        summary: "Replace championship placements"
      }
    }
  )
  .post(
    "/:id/awards",
    ({ params, body, set }) => {
      set.status = 201;
      return createChampionshipAward(params.id, body);
    },
    {
      params: championshipIdParamsSchema,
      body: t.Ref("CreateChampionshipAwardBody"),
      response: { 201: t.Ref("ChampionshipAward") },
      detail: {
        tags: ["Championships"],
        summary: "Create a championship award"
      }
    }
  )
  .patch(
    "/:id/awards/:awardId",
    ({ params, body }) =>
      updateChampionshipAward(params.id, params.awardId, body),
    {
      params: championshipAwardIdParamsSchema,
      body: t.Ref("UpdateChampionshipAwardBody"),
      response: { 200: t.Ref("ChampionshipAward") },
      detail: {
        tags: ["Championships"],
        summary: "Correct a championship award"
      }
    }
  )
  .post(
    "/:id/transitions",
    ({ params, body }) => transitionChampionship(params.id, body),
    {
      params: championshipIdParamsSchema,
      body: t.Ref("TransitionChampionshipBody"),
      response: { 200: t.Ref("ChampionshipDetail") },
      detail: {
        tags: ["Championships"],
        summary: "Transition a championship"
      }
    }
  )
  .post(
    "/:id/team-identities",
    ({ params, body, set }) => {
      set.status = 201;

      return createTeamIdentity(params.id, body);
    },
    {
      params: championshipIdParamsSchema,
      body: t.Ref("CreateTeamIdentityBody"),
      response: { 201: t.Ref("ChampionshipTeamIdentity") },
      detail: {
        tags: ["Championships"],
        summary: "Create a team identity from a championship"
      }
    }
  )
  .patch(
    "/:id/team-identities/:teamIdentityId",
    ({ params, body }) =>
      updateTeamIdentity(params.id, params.teamIdentityId, body),
    {
      params: championshipTeamIdentityIdParamsSchema,
      body: t.Ref("UpdateTeamIdentityBody"),
      response: { 200: t.Ref("ChampionshipTeamIdentity") },
      detail: {
        tags: ["Championships"],
        summary: "Update or archive a championship team identity"
      }
    }
  )
  .post(
    "/:id/teams",
    ({ params, body, set }) => {
      set.status = 201;

      return createChampionshipTeam(params.id, body);
    },
    {
      params: championshipIdParamsSchema,
      body: t.Ref("CreateChampionshipTeamBody"),
      response: { 201: t.Ref("ChampionshipTeam") },
      detail: {
        tags: ["Championships"],
        summary: "Create a championship team"
      }
    }
  )
  .get(
    "/:id/teams",
    ({ params, query }) => listChampionshipTeams(params.id, query),
    {
      params: championshipIdParamsSchema,
      query: paginationQuerySchema,
      response: { 200: t.Ref("ListChampionshipTeams") },
      detail: {
        tags: ["Championships"],
        summary: "List championship teams"
      }
    }
  )
  .patch(
    "/:id/teams/:teamId",
    ({ params, body }) =>
      updateChampionshipTeam(params.id, params.teamId, body),
    {
      params: championshipTeamIdParamsSchema,
      body: t.Ref("UpdateChampionshipTeamBody"),
      response: { 200: t.Ref("ChampionshipTeam") },
      detail: {
        tags: ["Championships"],
        summary: "Update a championship team"
      }
    }
  )
  .get(
    "/:id/participants",
    ({ params, query }) => listChampionshipParticipants(params.id, query),
    {
      params: championshipIdParamsSchema,
      query: listChampionshipParticipantsQuerySchema,
      response: { 200: t.Ref("ListChampionshipParticipants") },
      detail: {
        tags: ["Championships"],
        summary: "List championship participants"
      }
    }
  )
  .post(
    "/:id/registration/transitions",
    ({ params, body }) => transitionChampionshipRegistration(params.id, body),
    {
      params: championshipIdParamsSchema,
      body: t.Ref("TransitionChampionshipRegistrationBody"),
      response: { 200: t.Ref("ChampionshipDetail") },
      detail: {
        tags: ["Championships"],
        summary: "Open or close championship registration"
      }
    }
  )
  .post(
    "/:id/registrations/self",
    ({ params, body, set }) => {
      set.status = 201;

      return selfRegisterChampionship(params.id, body);
    },
    {
      params: championshipIdParamsSchema,
      body: t.Ref("SelfRegisterChampionshipBody"),
      response: { 201: t.Ref("ChampionshipParticipant") },
      detail: {
        tags: ["Championships"],
        summary: "Register the acting account for a championship"
      }
    }
  )
  .get(
    "/:id/registrations/self",
    async ({ params, query }) => ({
      participant: await getSelfChampionshipRegistration(
        params.id,
        query.actorAccountUuid
      )
    }),
    {
      params: championshipIdParamsSchema,
      query: championshipSelfRegistrationQuerySchema,
      response: { 200: t.Ref("ChampionshipSelfRegistration") },
      detail: {
        tags: ["Championships"],
        summary: "Get the acting account championship registration"
      }
    }
  )
  .post(
    "/:id/registrations/self/withdraw",
    ({ params, body }) => withdrawChampionshipRegistration(params.id, body),
    {
      params: championshipIdParamsSchema,
      body: t.Ref("WithdrawChampionshipRegistrationBody"),
      response: { 200: t.Ref("ChampionshipParticipant") },
      detail: {
        tags: ["Championships"],
        summary: "Withdraw the acting account championship registration"
      }
    }
  )
  .post(
    "/:id/participants",
    ({ params, body, set }) => {
      set.status = 201;

      return createChampionshipParticipant(params.id, body);
    },
    {
      params: championshipIdParamsSchema,
      body: t.Ref("CreateChampionshipParticipantBody"),
      response: { 201: t.Ref("ChampionshipParticipant") },
      detail: {
        tags: ["Championships"],
        summary: "Register an account for a championship as staff"
      }
    }
  )
  .patch(
    "/:id/participants/:participantId",
    ({ params, body }) =>
      updateChampionshipParticipant(params.id, params.participantId, body),
    {
      params: championshipParticipantIdParamsSchema,
      body: t.Ref("UpdateChampionshipParticipantBody"),
      response: { 200: t.Ref("ChampionshipParticipant") },
      detail: {
        tags: ["Championships"],
        summary: "Change a championship participant status"
      }
    }
  )
  .get(
    "/:id/salary",
    ({ params, query }) =>
      getPublicChampionshipSalaryProjection(params.id, query),
    {
      params: championshipIdParamsSchema,
      query: championshipSalaryQuerySchema,
      response: { 200: t.Ref("ChampionshipSalaryProjection") },
      detail: {
        tags: ["Championships"],
        summary: "Get the public championship salary projection"
      }
    }
  )
  .get(
    "/:id/salary/admin",
    ({ params, query }) =>
      getAdminChampionshipSalaryProjection(params.id, query),
    {
      params: championshipIdParamsSchema,
      query: championshipSalaryAdminQuerySchema,
      response: { 200: t.Ref("ChampionshipSalaryProjection") },
      detail: {
        tags: ["Championships"],
        summary: "Get the staff championship salary workspace projection"
      }
    }
  )
  .put(
    "/:id/salary/prices",
    ({ params, body }) => upsertChampionshipPrices(params.id, body),
    {
      params: championshipIdParamsSchema,
      body: t.Ref("UpsertChampionshipPricesBody"),
      response: { 200: t.Ref("ChampionshipSalaryProjection") },
      detail: {
        tags: ["Championships"],
        summary: "Bulk update championship participant prices"
      }
    }
  )
  .post(
    "/:id/salary/prices/freeze",
    ({ params, body }) => freezeChampionshipPrices(params.id, body),
    {
      params: championshipIdParamsSchema,
      body: t.Ref("FreezeChampionshipPricesBody"),
      response: { 200: t.Ref("ChampionshipSalaryProjection") },
      detail: {
        tags: ["Championships"],
        summary: "Freeze championship participant prices"
      }
    }
  )
  .post(
    "/:id/roster-moves/preview",
    ({ params, body }) => previewChampionshipRosterMove(params.id, body),
    {
      params: championshipIdParamsSchema,
      body: t.Ref("PreviewChampionshipRosterMoveBody"),
      response: { 200: t.Ref("ChampionshipRosterMovePreview") },
      detail: {
        tags: ["Championships"],
        summary: "Preview a championship roster move"
      }
    }
  )
  .post(
    "/:id/roster-moves",
    ({ params, body }) => executeChampionshipRosterMove(params.id, body),
    {
      params: championshipIdParamsSchema,
      body: t.Ref("ExecuteChampionshipRosterMoveBody"),
      response: { 200: t.Ref("ChampionshipRosterMembership") },
      detail: {
        tags: ["Championships"],
        summary: "Execute a staff championship roster move"
      }
    }
  )
  .put(
    "/:id/roster-order",
    ({ params, body }) => reorderChampionshipRoster(params.id, body),
    {
      params: championshipIdParamsSchema,
      body: t.Ref("ReorderChampionshipRosterBody"),
      response: { 200: t.Ref("ChampionshipRosterOrder") },
      detail: {
        tags: ["Championships"],
        summary: "Reorder an active championship roster"
      }
    }
  )
  .get(
    "/:id/roster-history",
    ({ params, query }) => listChampionshipRosterHistory(params.id, query),
    {
      params: championshipIdParamsSchema,
      query: championshipRosterHistoryQuerySchema,
      response: { 200: t.Ref("ListChampionshipRosterHistory") },
      detail: {
        tags: ["Championships"],
        summary: "List bounded championship roster history"
      }
    }
  )
  .get(
    "/:id/draft",
    ({ params, query }) => getChampionshipDraft(params.id, query),
    {
      params: championshipIdParamsSchema,
      query: championshipDraftQuerySchema,
      response: { 200: t.Ref("ChampionshipDraft") },
      detail: {
        tags: ["Championships"],
        summary: "Get the bounded live championship draft projection"
      }
    }
  )
  .put(
    "/:id/draft",
    ({ params, body }) => configureChampionshipDraft(params.id, body),
    {
      params: championshipIdParamsSchema,
      body: t.Ref("ConfigureChampionshipDraftBody"),
      response: { 200: t.Ref("ChampionshipDraft") },
      detail: {
        tags: ["Championships"],
        summary: "Configure and materialize a championship draft"
      }
    }
  )
  .post(
    "/:id/draft/start",
    ({ params, body }) => startChampionshipDraft(params.id, body),
    {
      params: championshipIdParamsSchema,
      body: t.Ref("StartChampionshipDraftBody"),
      response: { 200: t.Ref("ChampionshipDraft") },
      detail: {
        tags: ["Championships"],
        summary: "Start a configured championship draft"
      }
    }
  )
  .post(
    "/:id/draft/picks",
    ({ params, body }) => makeChampionshipDraftPick(params.id, body),
    {
      params: championshipIdParamsSchema,
      body: t.Ref("MakeChampionshipDraftPickBody"),
      response: { 200: t.Ref("ChampionshipDraft") },
      detail: {
        tags: ["Championships"],
        summary: "Make the oldest eligible championship draft pick"
      }
    }
  )
  .post(
    "/:id/draft/end",
    ({ params, body }) => endChampionshipDraft(params.id, body),
    {
      params: championshipIdParamsSchema,
      body: t.Ref("EndChampionshipDraftBody"),
      response: { 200: t.Ref("ChampionshipDraft") },
      detail: {
        tags: ["Championships"],
        summary: "Explicitly end a live championship draft"
      }
    }
  )
  .post(
    "/:id/draft/cancel",
    ({ params, body }) => cancelChampionshipDraft(params.id, body),
    {
      params: championshipIdParamsSchema,
      body: t.Ref("CancelChampionshipDraftBody"),
      response: { 200: t.Ref("ChampionshipDraft") },
      detail: {
        tags: ["Championships"],
        summary: "Cancel a championship draft without completed picks"
      }
    }
  )
  .get(
    "/:id/draft/turns/:turnId/correction-preview",
    ({ params, query }) =>
      getChampionshipDraftCorrectionPreview(
        params.id,
        params.turnId,
        query.actorAccountUuid
      ),
    {
      params: championshipDraftTurnIdParamsSchema,
      query: championshipDraftCorrectionPreviewQuerySchema,
      response: { 200: t.Ref("ChampionshipDraftCorrectionPreview") },
      detail: {
        tags: ["Championships"],
        summary: "Preview reversal of a championship draft pick"
      }
    }
  )
  .post(
    "/:id/draft/turns/:turnId/void",
    ({ params, body }) =>
      voidChampionshipDraftPick(params.id, params.turnId, body),
    {
      params: championshipDraftTurnIdParamsSchema,
      body: t.Ref("VoidChampionshipDraftPickBody"),
      response: { 200: t.Ref("ChampionshipDraft") },
      detail: {
        tags: ["Championships"],
        summary: "Reverse and reopen a championship draft pick"
      }
    }
  )
  .get(
    "/:id/trades",
    ({ params, query }) => listChampionshipTrades(params.id, query),
    {
      params: championshipIdParamsSchema,
      query: listChampionshipTradesQuerySchema,
      response: { 200: t.Ref("ListChampionshipTrades") },
      detail: {
        tags: ["Championships"],
        summary: "List bounded public, involved, or staff championship trades"
      }
    }
  )
  .post(
    "/:id/trades",
    ({ params, body, set }) => {
      set.status = 201;

      return createChampionshipTrade(params.id, body);
    },
    {
      params: championshipIdParamsSchema,
      body: t.Ref("CreateChampionshipTradeBody"),
      response: { 201: t.Ref("ChampionshipTrade") },
      detail: {
        tags: ["Championships"],
        summary: "Propose a two-team player trade"
      }
    }
  )
  .post(
    "/:id/trades/:tradeId/accept",
    ({ params, body }) =>
      acceptChampionshipTrade(params.id, params.tradeId, body),
    {
      params: championshipTradeIdParamsSchema,
      body: t.Ref("DecideChampionshipTradeBody"),
      response: { 200: t.Ref("ChampionshipTrade") },
      detail: {
        tags: ["Championships"],
        summary: "Accept and atomically apply a championship trade"
      }
    }
  )
  .post(
    "/:id/trades/:tradeId/reject",
    ({ params, body }) =>
      rejectChampionshipTrade(params.id, params.tradeId, body),
    {
      params: championshipTradeIdParamsSchema,
      body: t.Ref("DecideChampionshipTradeBody"),
      response: { 200: t.Ref("ChampionshipTrade") },
      detail: {
        tags: ["Championships"],
        summary: "Reject a championship trade"
      }
    }
  )
  .post(
    "/:id/trades/:tradeId/cancel",
    ({ params, body }) =>
      cancelChampionshipTrade(params.id, params.tradeId, body),
    {
      params: championshipTradeIdParamsSchema,
      body: t.Ref("DecideChampionshipTradeBody"),
      response: { 200: t.Ref("ChampionshipTrade") },
      detail: {
        tags: ["Championships"],
        summary: "Cancel a championship trade"
      }
    }
  )
  .get(
    "/:id/format",
    ({ params, query }) => getChampionshipFormat(params.id, query),
    {
      params: championshipIdParamsSchema,
      query: championshipFormatQuerySchema,
      response: { 200: t.Ref("ChampionshipFormat") },
      detail: {
        tags: ["Championships"],
        summary: "Get a bounded championship stage and progression graph"
      }
    }
  )
  .post(
    "/:id/stages",
    ({ params, body }) => createChampionshipStage(params.id, body),
    {
      params: championshipIdParamsSchema,
      body: t.Ref("CreateChampionshipStageBody"),
      response: { 200: t.Ref("ChampionshipFormat") },
      detail: {
        tags: ["Championships"],
        summary: "Create an editable championship stage"
      }
    }
  )
  .patch(
    "/:id/stages/:stageId",
    ({ params, body }) =>
      updateChampionshipStage(params.id, params.stageId, body),
    {
      params: championshipStageIdParamsSchema,
      body: t.Ref("UpdateChampionshipStageBody"),
      response: { 200: t.Ref("ChampionshipFormat") },
      detail: {
        tags: ["Championships"],
        summary: "Update a championship stage"
      }
    }
  )
  .delete(
    "/:id/stages/:stageId",
    ({ params, body }) =>
      deleteChampionshipStage(params.id, params.stageId, body),
    {
      params: championshipStageIdParamsSchema,
      body: t.Ref("DeleteChampionshipStageBody"),
      response: { 200: t.Ref("ChampionshipFormat") },
      detail: {
        tags: ["Championships"],
        summary: "Delete an empty championship stage"
      }
    }
  )
  .post(
    "/:id/stages/:stageId/groups",
    ({ params, body }) =>
      createChampionshipGroup(params.id, params.stageId, body),
    {
      params: championshipStageIdParamsSchema,
      body: t.Ref("CreateChampionshipGroupBody"),
      response: { 200: t.Ref("ChampionshipFormat") },
      detail: {
        tags: ["Championships"],
        summary: "Create a standings group and its initial team spots"
      }
    }
  )
  .put(
    "/:id/stages/:stageId/standings-rules",
    ({ params, body }) =>
      configureChampionshipStandings(params.id, params.stageId, body),
    {
      params: championshipStageIdParamsSchema,
      body: t.Ref("ConfigureChampionshipStandingsBody"),
      response: { 200: t.Ref("ChampionshipFormat") },
      detail: {
        tags: ["Championships"],
        summary: "Configure stage scoring and classification criteria"
      }
    }
  )
  .get(
    "/:id/stages/:stageId/groups/:groupId/standings",
    ({ params, query }) =>
      getChampionshipStandings(
        params.id,
        params.stageId,
        params.groupId,
        query
      ),
    {
      params: championshipGroupIdParamsSchema,
      query: championshipStandingsQuerySchema,
      response: { 200: t.Ref("ChampionshipStandings") },
      detail: {
        tags: ["Championships"],
        summary: "Get explained group standings and qualification paths"
      }
    }
  )
  .post(
    "/:id/stages/:stageId/round-robin/preview",
    ({ params, body }) =>
      previewChampionshipRoundRobin(params.id, params.stageId, body),
    {
      params: championshipStageIdParamsSchema,
      body: t.Ref("PreviewChampionshipRoundRobinBody"),
      response: { 200: t.Ref("ChampionshipRoundRobinPreview") },
      detail: {
        tags: ["Championships"],
        summary: "Preview missing round-robin matches without changing format"
      }
    }
  )
  .post(
    "/:id/stages/:stageId/round-robin",
    ({ params, body }) =>
      generateChampionshipRoundRobin(params.id, params.stageId, body),
    {
      params: championshipStageIdParamsSchema,
      body: t.Ref("GenerateChampionshipRoundRobinBody"),
      response: { 200: t.Ref("ChampionshipFormat") },
      detail: {
        tags: ["Championships"],
        summary: "Generate only missing round-robin matches"
      }
    }
  )
  .post(
    "/:id/stages/:stageId/groups/:groupId/classification/preview",
    ({ params, body }) =>
      previewChampionshipClassification(
        params.id,
        params.stageId,
        params.groupId,
        body
      ),
    {
      params: championshipGroupIdParamsSchema,
      body: t.Ref("PreviewChampionshipClassificationBody"),
      response: { 200: t.Ref("ChampionshipStandings") },
      detail: {
        tags: ["Championships"],
        summary: "Preview qualification placements and correction impact"
      }
    }
  )
  .post(
    "/:id/stages/:stageId/groups/:groupId/classification/apply",
    ({ params, body }) =>
      applyChampionshipClassification(
        params.id,
        params.stageId,
        params.groupId,
        body
      ),
    {
      params: championshipGroupIdParamsSchema,
      body: t.Ref("ApplyChampionshipClassificationBody"),
      response: { 200: t.Ref("ChampionshipStandings") },
      detail: {
        tags: ["Championships"],
        summary: "Atomically apply a confirmed classification projection"
      }
    }
  )
  .post(
    "/:id/stages/single-elimination",
    ({ params, body }) => generateSingleElimination(params.id, body),
    {
      params: championshipIdParamsSchema,
      body: t.Ref("GenerateSingleEliminationBody"),
      response: { 200: t.Ref("ChampionshipFormat") },
      detail: {
        tags: ["Championships"],
        summary: "Generate a connected single-elimination stage"
      }
    }
  )
  .post(
    "/:id/stages/double-elimination/preview",
    ({ params, body }) => previewDoubleElimination(params.id, body),
    {
      params: championshipIdParamsSchema,
      body: t.Ref("PreviewDoubleEliminationBody"),
      response: { 200: t.Ref("ChampionshipDoubleEliminationPreview") },
      detail: {
        tags: ["Championships"],
        summary: "Preview a connected double-elimination stage"
      }
    }
  )
  .post(
    "/:id/stages/double-elimination",
    ({ params, body }) => generateDoubleElimination(params.id, body),
    {
      params: championshipIdParamsSchema,
      body: t.Ref("GenerateDoubleEliminationBody"),
      response: { 200: t.Ref("ChampionshipFormat") },
      detail: {
        tags: ["Championships"],
        summary: "Generate a connected double-elimination stage"
      }
    }
  )
  .post(
    "/:id/spots",
    ({ params, body }) => createChampionshipSpot(params.id, body),
    {
      params: championshipIdParamsSchema,
      body: t.Ref("CreateChampionshipSpotBody"),
      response: { 200: t.Ref("ChampionshipFormat") },
      detail: {
        tags: ["Championships"],
        summary: "Create a manual championship spot"
      }
    }
  )
  .post(
    "/:id/spots/:spotId/placement-preview",
    ({ params, body }) =>
      previewChampionshipSpotPlacement(params.id, params.spotId, body),
    {
      params: championshipSpotIdParamsSchema,
      body: t.Ref("PreviewChampionshipSpotPlacementBody"),
      response: { 200: t.Ref("ChampionshipSpotPlacementPreview") },
      detail: {
        tags: ["Championships"],
        summary: "Preview the cascade caused by placing or moving a team"
      }
    }
  )
  .post(
    "/:id/spots/:spotId/place",
    ({ params, body }) => placeChampionshipSpot(params.id, params.spotId, body),
    {
      params: championshipSpotIdParamsSchema,
      body: t.Ref("PlaceChampionshipSpotBody"),
      response: { 200: t.Ref("ChampionshipFormat") },
      detail: {
        tags: ["Championships"],
        summary: "Immediately place or remove a team from a spot"
      }
    }
  )
  .post(
    "/:id/progression-routes",
    ({ params, body }) => createChampionshipRoute(params.id, body),
    {
      params: championshipIdParamsSchema,
      body: t.Ref("CreateChampionshipRouteBody"),
      response: { 200: t.Ref("ChampionshipFormat") },
      detail: {
        tags: ["Championships"],
        summary: "Create a progression route"
      }
    }
  )
  .patch(
    "/:id/progression-routes/:routeId",
    ({ params, body }) =>
      updateChampionshipRoute(params.id, params.routeId, body),
    {
      params: championshipRouteIdParamsSchema,
      body: t.Ref("UpdateChampionshipRouteBody"),
      response: { 200: t.Ref("ChampionshipFormat") },
      detail: {
        tags: ["Championships"],
        summary: "Enable or disable a progression route"
      }
    }
  )
  .post(
    "/:id/competition-rounds",
    ({ params, body }) => createChampionshipCompetitionRound(params.id, body),
    {
      params: championshipIdParamsSchema,
      body: t.Ref("CreateChampionshipCompetitionRoundBody"),
      response: { 200: t.Ref("ChampionshipFormat") },
      detail: {
        tags: ["Championships"],
        summary: "Create a championship competition round"
      }
    }
  )
  .post(
    "/:id/championship-matches",
    ({ params, body }) => createChampionshipMatch(params.id, body),
    {
      params: championshipIdParamsSchema,
      body: t.Ref("CreateChampionshipMatchBody"),
      response: { 200: t.Ref("ChampionshipFormat") },
      detail: {
        tags: ["Championships"],
        summary: "Create a logical championship match"
      }
    }
  )
  .patch(
    "/:id/championship-matches/:championshipMatchId/schedule",
    ({ params, body }) =>
      scheduleChampionshipMatch(params.id, params.championshipMatchId, body),
    {
      params: championshipMatchIdParamsSchema,
      body: t.Ref("ScheduleChampionshipMatchBody"),
      response: { 200: t.Ref("ChampionshipFormat") },
      detail: {
        tags: ["Championships"],
        summary: "Assign a competition round, program, and schedule to a match"
      }
    }
  )
  .get(
    "/:id/championship-matches/:championshipMatchId/scheduling",
    ({ params, query }) =>
      getChampionshipMatchScheduling(
        params.id,
        params.championshipMatchId,
        query
      ),
    {
      params: championshipMatchIdParamsSchema,
      query: championshipMatchSchedulingQuerySchema,
      response: { 200: t.Ref("ChampionshipMatchScheduling") },
      detail: {
        tags: ["Championships"],
        summary: "Get the private schedule negotiation for a match"
      }
    }
  )
  .post(
    "/:id/championship-matches/:championshipMatchId/schedule-proposals",
    ({ params, body }) =>
      createChampionshipScheduleProposal(
        params.id,
        params.championshipMatchId,
        body
      ),
    {
      params: championshipMatchIdParamsSchema,
      body: t.Ref("CreateChampionshipScheduleProposalBody"),
      response: { 200: t.Ref("ChampionshipMatchScheduling") },
      detail: {
        tags: ["Championships"],
        summary: "Create or counter a private match schedule proposal"
      }
    }
  )
  .post(
    "/:id/championship-matches/:championshipMatchId/schedule-proposals/:proposalId/decision",
    ({ params, body }) =>
      decideChampionshipScheduleProposal(
        params.id,
        params.championshipMatchId,
        params.proposalId,
        body
      ),
    {
      params: championshipScheduleProposalIdParamsSchema,
      body: t.Ref("DecideChampionshipScheduleProposalBody"),
      response: { 200: t.Ref("ChampionshipMatchScheduling") },
      detail: {
        tags: ["Championships"],
        summary: "Accept, reject, or withdraw a schedule proposal"
      }
    }
  )
  .post(
    "/:id/championship-matches/:championshipMatchId/late-play-authorizations",
    ({ params, body }) =>
      authorizeChampionshipLatePlay(
        params.id,
        params.championshipMatchId,
        body
      ),
    {
      params: championshipMatchIdParamsSchema,
      body: t.Ref("AuthorizeChampionshipLatePlayBody"),
      response: { 200: t.Ref("ChampionshipMatchScheduling") },
      detail: {
        tags: ["Championships"],
        summary: "Authorize a match to be played after its competition round"
      }
    }
  )
  .post(
    "/:id/championship-matches/:championshipMatchId/late-play-authorizations/:authorizationId/revoke",
    ({ params, body }) =>
      revokeChampionshipLatePlay(
        params.id,
        params.championshipMatchId,
        params.authorizationId,
        body
      ),
    {
      params: championshipLateAuthorizationIdParamsSchema,
      body: t.Ref("RevokeChampionshipLatePlayBody"),
      response: { 200: t.Ref("ChampionshipMatchScheduling") },
      detail: {
        tags: ["Championships"],
        summary: "Revoke a late-play authorization"
      }
    }
  )
  .post(
    "/:id/championship-matches/:championshipMatchId/schedule-reminders",
    ({ params, body }) =>
      remindChampionshipSchedule(params.id, params.championshipMatchId, body),
    {
      params: championshipMatchIdParamsSchema,
      body: t.Ref("RemindChampionshipScheduleBody"),
      response: { 200: t.Ref("ChampionshipMatchScheduling") },
      detail: {
        tags: ["Championships"],
        summary: "Send an in-app schedule reminder to the opposing GMs"
      }
    }
  )
  .get(
    "/:id/matches/:championshipMatchId",
    ({ params, query }) =>
      getChampionshipMatchOperations(
        params.id,
        params.championshipMatchId,
        query.actorAccountUuid
      ),
    {
      params: championshipMatchOperationsParamsSchema,
      query: championshipMatchOperationsQuerySchema,
      response: { 200: t.Ref("ChampionshipMatchOperations") },
      detail: {
        tags: ["Championships"],
        summary: "Get a championship match operations projection"
      }
    }
  )
  .get(
    "/:id/matches/:championshipMatchId/evidence-candidates",
    ({ params, query }) =>
      listChampionshipEvidenceCandidates(
        params.id,
        params.championshipMatchId,
        query
      ),
    {
      params: championshipMatchOperationsParamsSchema,
      query: championshipEvidenceCandidatesQuerySchema,
      response: { 200: t.Ref("ChampionshipEvidenceCandidates") },
      detail: {
        tags: ["Championships"],
        summary: "Search completed logical matches for championship evidence"
      }
    }
  )
  .put(
    "/:id/matches/:championshipMatchId/evidence",
    ({ params, body }) =>
      attachChampionshipMatchEvidence(
        params.id,
        params.championshipMatchId,
        body
      ),
    {
      params: championshipMatchOperationsParamsSchema,
      body: t.Ref("AttachChampionshipMatchEvidenceBody"),
      response: { 200: t.Ref("ChampionshipMatchOperations") },
      detail: {
        tags: ["Championships"],
        summary: "Attach registered logical-match evidence"
      }
    }
  )
  .delete(
    "/:id/matches/:championshipMatchId/evidence",
    ({ params, body }) =>
      detachChampionshipMatchEvidence(
        params.id,
        params.championshipMatchId,
        body
      ),
    {
      params: championshipMatchOperationsParamsSchema,
      body: t.Ref("DetachChampionshipMatchEvidenceBody"),
      response: { 200: t.Ref("ChampionshipMatchOperations") },
      detail: {
        tags: ["Championships"],
        summary: "Detach championship evidence and release its claim"
      }
    }
  )
  .post(
    "/:id/matches/:championshipMatchId/settlement-previews",
    ({ params, body }) =>
      previewChampionshipMatchSettlement(
        params.id,
        params.championshipMatchId,
        body
      ),
    {
      params: championshipMatchOperationsParamsSchema,
      body: t.Ref("PreviewChampionshipSettlementBody"),
      response: { 200: t.Ref("ChampionshipSettlementPreview") },
      detail: {
        tags: ["Championships"],
        summary: "Preview settlement, routing, and eligibility impact"
      }
    }
  )
  .post(
    "/:id/matches/:championshipMatchId/settlements",
    ({ params, body }) =>
      settleChampionshipMatch(params.id, params.championshipMatchId, body),
    {
      params: championshipMatchOperationsParamsSchema,
      body: t.Ref("SettleChampionshipMatchBody"),
      response: { 200: t.Ref("ChampionshipMatchOperations") },
      detail: {
        tags: ["Championships"],
        summary: "Settle a championship match and route its outcome"
      }
    }
  )
  .post(
    "/:id/matches/:championshipMatchId/correction-previews",
    ({ params, body }) =>
      previewChampionshipMatchSettlement(
        params.id,
        params.championshipMatchId,
        body
      ),
    {
      params: championshipMatchOperationsParamsSchema,
      body: t.Ref("PreviewChampionshipSettlementBody"),
      response: { 200: t.Ref("ChampionshipSettlementPreview") },
      detail: {
        tags: ["Championships"],
        summary: "Preview recursive result correction impact"
      }
    }
  )
  .post(
    "/:id/matches/:championshipMatchId/corrections",
    ({ params, body }) =>
      settleChampionshipMatch(params.id, params.championshipMatchId, body),
    {
      params: championshipMatchOperationsParamsSchema,
      body: t.Ref("SettleChampionshipMatchBody"),
      response: { 200: t.Ref("ChampionshipMatchOperations") },
      detail: {
        tags: ["Championships"],
        summary: "Apply a result correction and recursive invalidation"
      }
    }
  )
  .put(
    "/:id/matches/:championshipMatchId/attributions",
    ({ params, body }) =>
      updateChampionshipMatchAttributions(
        params.id,
        params.championshipMatchId,
        body
      ),
    {
      params: championshipMatchOperationsParamsSchema,
      body: t.Ref("UpdateChampionshipAttributionsBody"),
      response: { 200: t.Ref("ChampionshipMatchOperations") },
      detail: {
        tags: ["Championships"],
        summary: "Revise championship-only player attribution"
      }
    }
  )
  .get(
    "/:id/statistics",
    ({ params, query }) => getChampionshipStatistics(params.id, query),
    {
      params: championshipIdParamsSchema,
      query: championshipStatisticsQuerySchema,
      response: { 200: t.Ref("ChampionshipStatistics") },
      detail: {
        tags: ["Championships"],
        summary: "Get bounded official team and player statistics"
      }
    }
  )
  .get(
    "/:id/statistic-mappings",
    ({ params, query }) => listChampionshipMetricMappings(params.id, query),
    {
      params: championshipIdParamsSchema,
      query: championshipMetricMappingsQuerySchema,
      response: { 200: t.Ref("ChampionshipMetricMappings") },
      detail: {
        tags: ["Championships"],
        summary: "List championship event-schema metric mappings"
      }
    }
  )
  .put(
    "/:id/statistic-mappings",
    ({ params, body }) => replaceChampionshipMetricMappings(params.id, body),
    {
      params: championshipIdParamsSchema,
      body: t.Ref("ReplaceChampionshipMetricMappingsBody"),
      response: { 200: t.Ref("ChampionshipMetricMappings") },
      detail: {
        tags: ["Championships"],
        summary: "Replace championship event-schema metric mappings"
      }
    }
  )
  .post(
    "/:id/room-programs",
    ({ params, body }) => updateChampionshipRoomProgram(params.id, body),
    {
      params: championshipIdParamsSchema,
      body: t.Ref("UpdateChampionshipRoomProgramBody"),
      response: { 200: t.Ref("ChampionshipDetail") },
      detail: {
        tags: ["Championships"],
        summary: "Change a championship room program"
      }
    }
  )
  .post(
    "/:id/grants",
    ({ params, body }) => updateChampionshipGrant(params.id, body),
    {
      params: championshipIdParamsSchema,
      body: t.Ref("UpdateChampionshipGrantBody"),
      response: { 200: t.Ref("ChampionshipDetail") },
      detail: {
        tags: ["Championships"],
        summary: "Change a championship permission grant"
      }
    }
  )
  .get(
    "/:id/audit",
    ({ params, query }) => listChampionshipAuditEvents(params.id, query),
    {
      params: championshipIdParamsSchema,
      query: listChampionshipAuditQuerySchema,
      response: { 200: t.Ref("ListChampionshipAudit") },
      detail: {
        tags: ["Championships"],
        summary: "List championship audit events"
      }
    }
  )
  .get(
    "/:id/threads",
    ({ params, query }) => listChampionshipThreads(params.id, query),
    {
      params: championshipIdParamsSchema,
      query: championshipCollaborationQuerySchema,
      response: { 200: t.Ref("ListChampionshipThreads") },
      detail: {
        tags: ["Championships"],
        summary: "List championship contextual threads"
      }
    }
  )
  .post(
    "/:id/threads",
    ({ params, body, set }) => {
      set.status = 201;

      return createChampionshipThread(params.id, body);
    },
    {
      params: championshipIdParamsSchema,
      body: t.Ref("CreateChampionshipThreadBody"),
      response: { 201: t.Ref("ChampionshipThread") },
      detail: {
        tags: ["Championships"],
        summary: "Create a championship contextual thread"
      }
    }
  )
  .patch(
    "/:id/threads/:threadId",
    ({ params, body }) =>
      updateChampionshipThread(params.id, params.threadId, body),
    {
      params: championshipThreadIdParamsSchema,
      body: t.Ref("UpdateChampionshipThreadBody"),
      response: { 200: t.Ref("ChampionshipThread") },
      detail: {
        tags: ["Championships"],
        summary: "Resolve or reopen a championship thread"
      }
    }
  )
  .get(
    "/:id/threads/:threadId/comments",
    ({ params, query }) =>
      listChampionshipComments(params.id, params.threadId, query),
    {
      params: championshipThreadIdParamsSchema,
      query: championshipCollaborationQuerySchema,
      response: { 200: t.Ref("ListChampionshipComments") },
      detail: {
        tags: ["Championships"],
        summary: "List championship thread comments"
      }
    }
  )
  .post(
    "/:id/threads/:threadId/comments",
    ({ params, body, set }) => {
      set.status = 201;

      return addChampionshipComment(params.id, params.threadId, body);
    },
    {
      params: championshipThreadIdParamsSchema,
      body: t.Ref("AddChampionshipCommentBody"),
      response: { 201: t.Ref("ChampionshipComment") },
      detail: {
        tags: ["Championships"],
        summary: "Add a championship thread comment"
      }
    }
  )
  .get(
    "/:id/assignments",
    ({ params, query }) => listChampionshipAssignments(params.id, query),
    {
      params: championshipIdParamsSchema,
      query: championshipCollaborationQuerySchema,
      response: { 200: t.Ref("ListChampionshipAssignments") },
      detail: {
        tags: ["Championships"],
        summary: "List championship assignments"
      }
    }
  )
  .post(
    "/:id/assignments",
    ({ params, body, set }) => {
      set.status = 201;

      return createChampionshipAssignment(params.id, body);
    },
    {
      params: championshipIdParamsSchema,
      body: t.Ref("CreateChampionshipAssignmentBody"),
      response: { 201: t.Ref("ChampionshipAssignment") },
      detail: {
        tags: ["Championships"],
        summary: "Create a championship assignment"
      }
    }
  )
  .patch(
    "/:id/assignments/:assignmentId",
    ({ params, body }) =>
      updateChampionshipAssignment(params.id, params.assignmentId, body),
    {
      params: championshipAssignmentIdParamsSchema,
      body: t.Ref("UpdateChampionshipAssignmentBody"),
      response: { 200: t.Ref("ChampionshipAssignment") },
      detail: {
        tags: ["Championships"],
        summary: "Update a championship assignment"
      }
    }
  )
  .get(
    "/:id/presence",
    ({ params, query }) =>
      listChampionshipPresence(params.id, query.actorAccountUuid),
    {
      params: championshipIdParamsSchema,
      query: championshipPresenceQuerySchema,
      response: { 200: t.Array(t.Ref("ChampionshipPresence")) },
      detail: {
        tags: ["Championships"],
        summary: "List active championship collaborators"
      }
    }
  )
  .post(
    "/:id/presence",
    ({ params, body }) => heartbeatChampionshipPresence(params.id, body),
    {
      params: championshipIdParamsSchema,
      body: championshipPresenceBodySchema,
      response: { 200: t.Array(t.Ref("ChampionshipPresence")) },
      detail: {
        tags: ["Championships"],
        summary: "Heartbeat a championship collaborator"
      }
    }
  )
  .get(
    "/:id/saved-views",
    ({ params, query }) => listChampionshipSavedViews(params.id, query),
    {
      params: championshipIdParamsSchema,
      query: championshipSavedViewsQuerySchema,
      response: { 200: t.Ref("ListChampionshipSavedViews") },
      detail: {
        tags: ["Championships"],
        summary: "List championship workspace saved views"
      }
    }
  )
  .put(
    "/:id/saved-views",
    ({ params, body }) => upsertChampionshipSavedView(params.id, body),
    {
      params: championshipIdParamsSchema,
      body: t.Ref("UpsertChampionshipSavedViewBody"),
      response: { 200: t.Ref("ChampionshipSavedView") },
      detail: {
        tags: ["Championships"],
        summary: "Create or update a championship workspace saved view"
      }
    }
  )
  .get(
    "/:id/events",
    ({ params, query, headers, request }) => {
      const lastEventId = Number.parseInt(headers["last-event-id"] ?? "", 10);

      return createChampionshipEventStream({
        championshipUuid: params.id,
        actorAccountUuid: query.actorAccountUuid,
        afterSequence: Number.isFinite(lastEventId)
          ? Math.max(lastEventId, query.afterSequence ?? 0)
          : (query.afterSequence ?? 0),
        signal: request.signal
      });
    },
    {
      params: championshipIdParamsSchema,
      query: championshipEventsQuerySchema,
      headers: t.Object({
        authorization: t.Optional(t.String()),
        "last-event-id": t.Optional(t.String())
      }),
      detail: {
        tags: ["Championships"],
        summary: "Stream championship changes"
      }
    }
  );

export {
  championshipCompetitionTypeResponseSchema,
  championshipDetailResponseSchema,
  championshipSummaryResponseSchema,
  championshipTeamIdentityResponseSchema,
  championshipTeamResponseSchema
};
