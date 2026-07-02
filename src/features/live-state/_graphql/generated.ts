import { JsonValue } from '@lib';
import { GraphQLResolveInfo, GraphQLScalarType, GraphQLScalarTypeConfig } from 'graphql';
import { LiveRoomState as LiveRoomStateModel, LiveNativeRoom as LiveNativeRoomModel, LiveNativeScore as LiveNativeScoreModel, LivePlayer as LivePlayerModel, LiveStateDocument as LiveStateDocumentModel, LiveStateFact as LiveStateFactModel } from '@/features/live-state/_shared/domain/protocol';
import { LiveRoomCommandResponse as LiveRoomCommandResponseModel } from '@/features/live-state/_shared/db/commands';
import { LiveStateGraphqlContext } from './context';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;
export type RequireFields<T, K extends keyof T> = Omit<T, K> & { [P in K]-?: NonNullable<T[P]> };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  DateTime: { input: string; output: string; }
  JSON: { input: JsonValue; output: JsonValue; }
};

export type BooleanFilter = {
  equals?: InputMaybe<Scalars['Boolean']['input']>;
};

export type EnqueueLiveRoomCommandInput = {
  name: Scalars['String']['input'];
  payload?: InputMaybe<Scalars['JSON']['input']>;
  roomId: Scalars['ID']['input'];
};

export type FloatFilter = {
  equals?: InputMaybe<Scalars['Float']['input']>;
};

export type IntFilter = {
  equals?: InputMaybe<Scalars['Int']['input']>;
};

export enum LiveGameStatus {
  Paused = 'PAUSED',
  Resuming = 'RESUMING',
  Running = 'RUNNING',
  Stopped = 'STOPPED'
}

export type LiveNativeRoom = {
  __typename?: 'LiveNativeRoom';
  gameStatus: LiveGameStatus;
  name?: Maybe<Scalars['String']['output']>;
  scores?: Maybe<LiveNativeScore>;
  teamsLocked?: Maybe<Scalars['Boolean']['output']>;
};

export type LiveNativeScore = {
  __typename?: 'LiveNativeScore';
  blue: Scalars['Int']['output'];
  red: Scalars['Int']['output'];
};

export type LivePlayer = {
  __typename?: 'LivePlayer';
  admin: Scalars['Boolean']['output'];
  avatar?: Maybe<Scalars['String']['output']>;
  desynced?: Maybe<Scalars['Boolean']['output']>;
  name: Scalars['String']['output'];
  playBlockedReason?: Maybe<Scalars['String']['output']>;
  playable?: Maybe<Scalars['Boolean']['output']>;
  roomPlayerId: Scalars['Int']['output'];
  sessionKind?: Maybe<LivePlayerSessionKind>;
  team: LiveTeam;
};

export type LivePlayerConnection = {
  __typename?: 'LivePlayerConnection';
  edges: Array<LivePlayerEdge>;
  pageInfo: PageInfo;
};

export type LivePlayerEdge = {
  __typename?: 'LivePlayerEdge';
  cursor: Scalars['String']['output'];
  node: LivePlayer;
};

export type LivePlayerListRelationFilter = {
  every?: InputMaybe<LivePlayerWhereInput>;
  none?: InputMaybe<LivePlayerWhereInput>;
  some?: InputMaybe<LivePlayerWhereInput>;
};

export enum LivePlayerSessionKind {
  Guest = 'GUEST',
  Resolving = 'RESOLVING',
  SignedIn = 'SIGNED_IN',
  SigningIn = 'SIGNING_IN'
}

export type LivePlayerWhereInput = {
  AND?: InputMaybe<Array<LivePlayerWhereInput>>;
  NOT?: InputMaybe<Array<LivePlayerWhereInput>>;
  OR?: InputMaybe<Array<LivePlayerWhereInput>>;
  admin?: InputMaybe<BooleanFilter>;
  desynced?: InputMaybe<BooleanFilter>;
  name?: InputMaybe<StringFilter>;
  playable?: InputMaybe<BooleanFilter>;
  roomPlayerId?: InputMaybe<IntFilter>;
  sessionKind?: InputMaybe<StringFilter>;
  team?: InputMaybe<StringFilter>;
};

export type LiveRoom = {
  __typename?: 'LiveRoom';
  connected: Scalars['Boolean']['output'];
  id: Scalars['ID']['output'];
  lastSeenAt: Scalars['DateTime']['output'];
  players: LivePlayerConnection;
  revision: Scalars['Int']['output'];
  room: LiveNativeRoom;
  stateDocuments: Array<LiveStateDocument>;
  stateFacts: Array<LiveStateFact>;
};


export type LiveRoomPlayersArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<LivePlayerWhereInput>;
};


export type LiveRoomStateDocumentsArgs = {
  where?: InputMaybe<LiveStateDocumentWhereInput>;
};


export type LiveRoomStateFactsArgs = {
  where?: InputMaybe<LiveStateFactWhereInput>;
};

export type LiveRoomCommand = {
  __typename?: 'LiveRoomCommand';
  completedAt?: Maybe<Scalars['DateTime']['output']>;
  createdAt: Scalars['DateTime']['output'];
  error?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  payload?: Maybe<Scalars['JSON']['output']>;
  result?: Maybe<Scalars['JSON']['output']>;
  roomId: Scalars['ID']['output'];
  sentAt?: Maybe<Scalars['DateTime']['output']>;
  status: LiveRoomCommandStatus;
  updatedAt: Scalars['DateTime']['output'];
};

export type LiveRoomCommandConnection = {
  __typename?: 'LiveRoomCommandConnection';
  edges: Array<LiveRoomCommandEdge>;
  pageInfo: PageInfo;
};

export type LiveRoomCommandEdge = {
  __typename?: 'LiveRoomCommandEdge';
  cursor: Scalars['String']['output'];
  node: LiveRoomCommand;
};

export enum LiveRoomCommandStatus {
  Acknowledged = 'ACKNOWLEDGED',
  Failed = 'FAILED',
  Queued = 'QUEUED',
  Sent = 'SENT'
}

export type LiveRoomConnection = {
  __typename?: 'LiveRoomConnection';
  edges: Array<LiveRoomEdge>;
  pageInfo: PageInfo;
};

export type LiveRoomEdge = {
  __typename?: 'LiveRoomEdge';
  cursor: Scalars['String']['output'];
  node: LiveRoom;
};

export type LiveRoomWhereInput = {
  AND?: InputMaybe<Array<LiveRoomWhereInput>>;
  NOT?: InputMaybe<Array<LiveRoomWhereInput>>;
  OR?: InputMaybe<Array<LiveRoomWhereInput>>;
  connected?: InputMaybe<BooleanFilter>;
  id?: InputMaybe<StringFilter>;
  players?: InputMaybe<LivePlayerListRelationFilter>;
  stateDocuments?: InputMaybe<LiveStateDocumentListRelationFilter>;
  stateFacts?: InputMaybe<LiveStateFactListRelationFilter>;
};

export type LiveStateDocument = {
  __typename?: 'LiveStateDocument';
  name: Scalars['String']['output'];
  namespace: Scalars['String']['output'];
  payload: Scalars['JSON']['output'];
  revision: Scalars['Int']['output'];
  updatedAt: Scalars['DateTime']['output'];
  version: Scalars['Int']['output'];
};

export type LiveStateDocumentListRelationFilter = {
  every?: InputMaybe<LiveStateDocumentWhereInput>;
  none?: InputMaybe<LiveStateDocumentWhereInput>;
  some?: InputMaybe<LiveStateDocumentWhereInput>;
};

export type LiveStateDocumentWhereInput = {
  AND?: InputMaybe<Array<LiveStateDocumentWhereInput>>;
  NOT?: InputMaybe<Array<LiveStateDocumentWhereInput>>;
  OR?: InputMaybe<Array<LiveStateDocumentWhereInput>>;
  name?: InputMaybe<StringFilter>;
  namespace?: InputMaybe<StringFilter>;
  version?: InputMaybe<IntFilter>;
};

export type LiveStateFact = {
  __typename?: 'LiveStateFact';
  booleanValue?: Maybe<Scalars['Boolean']['output']>;
  key: Scalars['String']['output'];
  namespace: Scalars['String']['output'];
  numberValue?: Maybe<Scalars['Float']['output']>;
  stringValue?: Maybe<Scalars['String']['output']>;
  type: LiveStateFactType;
};

export type LiveStateFactListRelationFilter = {
  every?: InputMaybe<LiveStateFactWhereInput>;
  none?: InputMaybe<LiveStateFactWhereInput>;
  some?: InputMaybe<LiveStateFactWhereInput>;
};

export enum LiveStateFactType {
  Boolean = 'BOOLEAN',
  Number = 'NUMBER',
  String = 'STRING'
}

export type LiveStateFactWhereInput = {
  AND?: InputMaybe<Array<LiveStateFactWhereInput>>;
  NOT?: InputMaybe<Array<LiveStateFactWhereInput>>;
  OR?: InputMaybe<Array<LiveStateFactWhereInput>>;
  booleanValue?: InputMaybe<BooleanFilter>;
  key?: InputMaybe<StringFilter>;
  namespace?: InputMaybe<StringFilter>;
  numberValue?: InputMaybe<FloatFilter>;
  stringValue?: InputMaybe<StringFilter>;
  type?: InputMaybe<StringFilter>;
};

export enum LiveTeam {
  Blue = 'BLUE',
  Red = 'RED',
  Spectators = 'SPECTATORS'
}

export type Mutation = {
  __typename?: 'Mutation';
  enqueueLiveRoomCommand: LiveRoomCommand;
};


export type MutationEnqueueLiveRoomCommandArgs = {
  input: EnqueueLiveRoomCommandInput;
};

export type PageInfo = {
  __typename?: 'PageInfo';
  endCursor?: Maybe<Scalars['String']['output']>;
  hasNextPage: Scalars['Boolean']['output'];
};

export type Query = {
  __typename?: 'Query';
  liveRoom?: Maybe<LiveRoom>;
  liveRoomCommands: LiveRoomCommandConnection;
  liveRooms: LiveRoomConnection;
};


export type QueryLiveRoomArgs = {
  id: Scalars['ID']['input'];
};


export type QueryLiveRoomCommandsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  roomId: Scalars['ID']['input'];
  status?: InputMaybe<LiveRoomCommandStatus>;
};


export type QueryLiveRoomsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<LiveRoomWhereInput>;
};

export type StringFilter = {
  contains?: InputMaybe<Scalars['String']['input']>;
  equals?: InputMaybe<Scalars['String']['input']>;
  startsWith?: InputMaybe<Scalars['String']['input']>;
};



export type ResolverTypeWrapper<T> = Promise<T> | T;


export type ResolverWithResolve<TResult, TParent, TContext, TArgs> = {
  resolve: ResolverFn<TResult, TParent, TContext, TArgs>;
};
export type Resolver<TResult, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>, TArgs = Record<PropertyKey, never>> = ResolverFn<TResult, TParent, TContext, TArgs> | ResolverWithResolve<TResult, TParent, TContext, TArgs>;

export type ResolverFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => Promise<TResult> | TResult;

export type SubscriptionSubscribeFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => AsyncIterable<TResult> | Promise<AsyncIterable<TResult>>;

export type SubscriptionResolveFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;

export interface SubscriptionSubscriberObject<TResult, TKey extends string, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<{ [key in TKey]: TResult }, TParent, TContext, TArgs>;
  resolve?: SubscriptionResolveFn<TResult, { [key in TKey]: TResult }, TContext, TArgs>;
}

export interface SubscriptionResolverObject<TResult, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<any, TParent, TContext, TArgs>;
  resolve: SubscriptionResolveFn<TResult, any, TContext, TArgs>;
}

export type SubscriptionObject<TResult, TKey extends string, TParent, TContext, TArgs> =
  | SubscriptionSubscriberObject<TResult, TKey, TParent, TContext, TArgs>
  | SubscriptionResolverObject<TResult, TParent, TContext, TArgs>;

export type SubscriptionResolver<TResult, TKey extends string, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>, TArgs = Record<PropertyKey, never>> =
  | ((...args: any[]) => SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>)
  | SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>;

export type TypeResolveFn<TTypes, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>> = (
  parent: TParent,
  context: TContext,
  info: GraphQLResolveInfo
) => Maybe<TTypes> | Promise<Maybe<TTypes>>;

export type IsTypeOfResolverFn<T = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>> = (obj: T, context: TContext, info: GraphQLResolveInfo) => boolean | Promise<boolean>;

export type NextResolverFn<T> = () => Promise<T>;

export type DirectiveResolverFn<TResult = Record<PropertyKey, never>, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>, TArgs = Record<PropertyKey, never>> = (
  next: NextResolverFn<TResult>,
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;





/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = {
  Boolean: ResolverTypeWrapper<Partial<Scalars['Boolean']['output']>>;
  BooleanFilter: ResolverTypeWrapper<Partial<BooleanFilter>>;
  DateTime: ResolverTypeWrapper<Partial<Scalars['DateTime']['output']>>;
  EnqueueLiveRoomCommandInput: ResolverTypeWrapper<Partial<EnqueueLiveRoomCommandInput>>;
  Float: ResolverTypeWrapper<Partial<Scalars['Float']['output']>>;
  FloatFilter: ResolverTypeWrapper<Partial<FloatFilter>>;
  ID: ResolverTypeWrapper<Partial<Scalars['ID']['output']>>;
  Int: ResolverTypeWrapper<Partial<Scalars['Int']['output']>>;
  IntFilter: ResolverTypeWrapper<Partial<IntFilter>>;
  JSON: ResolverTypeWrapper<Partial<Scalars['JSON']['output']>>;
  LiveGameStatus: ResolverTypeWrapper<Partial<LiveGameStatus>>;
  LiveNativeRoom: ResolverTypeWrapper<LiveNativeRoomModel>;
  LiveNativeScore: ResolverTypeWrapper<LiveNativeScoreModel>;
  LivePlayer: ResolverTypeWrapper<LivePlayerModel>;
  LivePlayerConnection: ResolverTypeWrapper<Partial<Omit<LivePlayerConnection, 'edges'> & { edges: Array<ResolversTypes['LivePlayerEdge']> }>>;
  LivePlayerEdge: ResolverTypeWrapper<Partial<Omit<LivePlayerEdge, 'node'> & { node: ResolversTypes['LivePlayer'] }>>;
  LivePlayerListRelationFilter: ResolverTypeWrapper<Partial<LivePlayerListRelationFilter>>;
  LivePlayerSessionKind: ResolverTypeWrapper<Partial<LivePlayerSessionKind>>;
  LivePlayerWhereInput: ResolverTypeWrapper<Partial<LivePlayerWhereInput>>;
  LiveRoom: ResolverTypeWrapper<LiveRoomStateModel>;
  LiveRoomCommand: ResolverTypeWrapper<LiveRoomCommandResponseModel>;
  LiveRoomCommandConnection: ResolverTypeWrapper<Partial<Omit<LiveRoomCommandConnection, 'edges'> & { edges: Array<ResolversTypes['LiveRoomCommandEdge']> }>>;
  LiveRoomCommandEdge: ResolverTypeWrapper<Partial<Omit<LiveRoomCommandEdge, 'node'> & { node: ResolversTypes['LiveRoomCommand'] }>>;
  LiveRoomCommandStatus: ResolverTypeWrapper<Partial<LiveRoomCommandStatus>>;
  LiveRoomConnection: ResolverTypeWrapper<Partial<Omit<LiveRoomConnection, 'edges'> & { edges: Array<ResolversTypes['LiveRoomEdge']> }>>;
  LiveRoomEdge: ResolverTypeWrapper<Partial<Omit<LiveRoomEdge, 'node'> & { node: ResolversTypes['LiveRoom'] }>>;
  LiveRoomWhereInput: ResolverTypeWrapper<Partial<LiveRoomWhereInput>>;
  LiveStateDocument: ResolverTypeWrapper<LiveStateDocumentModel>;
  LiveStateDocumentListRelationFilter: ResolverTypeWrapper<Partial<LiveStateDocumentListRelationFilter>>;
  LiveStateDocumentWhereInput: ResolverTypeWrapper<Partial<LiveStateDocumentWhereInput>>;
  LiveStateFact: ResolverTypeWrapper<LiveStateFactModel>;
  LiveStateFactListRelationFilter: ResolverTypeWrapper<Partial<LiveStateFactListRelationFilter>>;
  LiveStateFactType: ResolverTypeWrapper<Partial<LiveStateFactType>>;
  LiveStateFactWhereInput: ResolverTypeWrapper<Partial<LiveStateFactWhereInput>>;
  LiveTeam: ResolverTypeWrapper<Partial<LiveTeam>>;
  Mutation: ResolverTypeWrapper<Record<PropertyKey, never>>;
  PageInfo: ResolverTypeWrapper<Partial<PageInfo>>;
  Query: ResolverTypeWrapper<Record<PropertyKey, never>>;
  String: ResolverTypeWrapper<Partial<Scalars['String']['output']>>;
  StringFilter: ResolverTypeWrapper<Partial<StringFilter>>;
};

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = {
  Boolean: Partial<Scalars['Boolean']['output']>;
  BooleanFilter: Partial<BooleanFilter>;
  DateTime: Partial<Scalars['DateTime']['output']>;
  EnqueueLiveRoomCommandInput: Partial<EnqueueLiveRoomCommandInput>;
  Float: Partial<Scalars['Float']['output']>;
  FloatFilter: Partial<FloatFilter>;
  ID: Partial<Scalars['ID']['output']>;
  Int: Partial<Scalars['Int']['output']>;
  IntFilter: Partial<IntFilter>;
  JSON: Partial<Scalars['JSON']['output']>;
  LiveNativeRoom: LiveNativeRoomModel;
  LiveNativeScore: LiveNativeScoreModel;
  LivePlayer: LivePlayerModel;
  LivePlayerConnection: Partial<Omit<LivePlayerConnection, 'edges'> & { edges: Array<ResolversParentTypes['LivePlayerEdge']> }>;
  LivePlayerEdge: Partial<Omit<LivePlayerEdge, 'node'> & { node: ResolversParentTypes['LivePlayer'] }>;
  LivePlayerListRelationFilter: Partial<LivePlayerListRelationFilter>;
  LivePlayerWhereInput: Partial<LivePlayerWhereInput>;
  LiveRoom: LiveRoomStateModel;
  LiveRoomCommand: LiveRoomCommandResponseModel;
  LiveRoomCommandConnection: Partial<Omit<LiveRoomCommandConnection, 'edges'> & { edges: Array<ResolversParentTypes['LiveRoomCommandEdge']> }>;
  LiveRoomCommandEdge: Partial<Omit<LiveRoomCommandEdge, 'node'> & { node: ResolversParentTypes['LiveRoomCommand'] }>;
  LiveRoomConnection: Partial<Omit<LiveRoomConnection, 'edges'> & { edges: Array<ResolversParentTypes['LiveRoomEdge']> }>;
  LiveRoomEdge: Partial<Omit<LiveRoomEdge, 'node'> & { node: ResolversParentTypes['LiveRoom'] }>;
  LiveRoomWhereInput: Partial<LiveRoomWhereInput>;
  LiveStateDocument: LiveStateDocumentModel;
  LiveStateDocumentListRelationFilter: Partial<LiveStateDocumentListRelationFilter>;
  LiveStateDocumentWhereInput: Partial<LiveStateDocumentWhereInput>;
  LiveStateFact: LiveStateFactModel;
  LiveStateFactListRelationFilter: Partial<LiveStateFactListRelationFilter>;
  LiveStateFactWhereInput: Partial<LiveStateFactWhereInput>;
  Mutation: Record<PropertyKey, never>;
  PageInfo: Partial<PageInfo>;
  Query: Record<PropertyKey, never>;
  String: Partial<Scalars['String']['output']>;
  StringFilter: Partial<StringFilter>;
};

export interface DateTimeScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['DateTime'], any> {
  name: 'DateTime';
}

export interface JsonScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['JSON'], any> {
  name: 'JSON';
}

export type LiveNativeRoomResolvers<ContextType = LiveStateGraphqlContext, ParentType extends ResolversParentTypes['LiveNativeRoom'] = ResolversParentTypes['LiveNativeRoom']> = {
  gameStatus?: Resolver<ResolversTypes['LiveGameStatus'], ParentType, ContextType>;
  name?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  scores?: Resolver<Maybe<ResolversTypes['LiveNativeScore']>, ParentType, ContextType>;
  teamsLocked?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
};

export type LiveNativeScoreResolvers<ContextType = LiveStateGraphqlContext, ParentType extends ResolversParentTypes['LiveNativeScore'] = ResolversParentTypes['LiveNativeScore']> = {
  blue?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  red?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type LivePlayerResolvers<ContextType = LiveStateGraphqlContext, ParentType extends ResolversParentTypes['LivePlayer'] = ResolversParentTypes['LivePlayer']> = {
  admin?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  avatar?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  desynced?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  playBlockedReason?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  playable?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  roomPlayerId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  sessionKind?: Resolver<Maybe<ResolversTypes['LivePlayerSessionKind']>, ParentType, ContextType>;
  team?: Resolver<ResolversTypes['LiveTeam'], ParentType, ContextType>;
};

export type LivePlayerConnectionResolvers<ContextType = LiveStateGraphqlContext, ParentType extends ResolversParentTypes['LivePlayerConnection'] = ResolversParentTypes['LivePlayerConnection']> = {
  edges?: Resolver<Array<ResolversTypes['LivePlayerEdge']>, ParentType, ContextType>;
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>;
};

export type LivePlayerEdgeResolvers<ContextType = LiveStateGraphqlContext, ParentType extends ResolversParentTypes['LivePlayerEdge'] = ResolversParentTypes['LivePlayerEdge']> = {
  cursor?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  node?: Resolver<ResolversTypes['LivePlayer'], ParentType, ContextType>;
};

export type LiveRoomResolvers<ContextType = LiveStateGraphqlContext, ParentType extends ResolversParentTypes['LiveRoom'] = ResolversParentTypes['LiveRoom']> = {
  connected?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  lastSeenAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  players?: Resolver<ResolversTypes['LivePlayerConnection'], ParentType, ContextType, RequireFields<LiveRoomPlayersArgs, 'first'>>;
  revision?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  room?: Resolver<ResolversTypes['LiveNativeRoom'], ParentType, ContextType>;
  stateDocuments?: Resolver<Array<ResolversTypes['LiveStateDocument']>, ParentType, ContextType, Partial<LiveRoomStateDocumentsArgs>>;
  stateFacts?: Resolver<Array<ResolversTypes['LiveStateFact']>, ParentType, ContextType, Partial<LiveRoomStateFactsArgs>>;
};

export type LiveRoomCommandResolvers<ContextType = LiveStateGraphqlContext, ParentType extends ResolversParentTypes['LiveRoomCommand'] = ResolversParentTypes['LiveRoomCommand']> = {
  completedAt?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  error?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  payload?: Resolver<Maybe<ResolversTypes['JSON']>, ParentType, ContextType>;
  result?: Resolver<Maybe<ResolversTypes['JSON']>, ParentType, ContextType>;
  roomId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  sentAt?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  status?: Resolver<ResolversTypes['LiveRoomCommandStatus'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
};

export type LiveRoomCommandConnectionResolvers<ContextType = LiveStateGraphqlContext, ParentType extends ResolversParentTypes['LiveRoomCommandConnection'] = ResolversParentTypes['LiveRoomCommandConnection']> = {
  edges?: Resolver<Array<ResolversTypes['LiveRoomCommandEdge']>, ParentType, ContextType>;
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>;
};

export type LiveRoomCommandEdgeResolvers<ContextType = LiveStateGraphqlContext, ParentType extends ResolversParentTypes['LiveRoomCommandEdge'] = ResolversParentTypes['LiveRoomCommandEdge']> = {
  cursor?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  node?: Resolver<ResolversTypes['LiveRoomCommand'], ParentType, ContextType>;
};

export type LiveRoomConnectionResolvers<ContextType = LiveStateGraphqlContext, ParentType extends ResolversParentTypes['LiveRoomConnection'] = ResolversParentTypes['LiveRoomConnection']> = {
  edges?: Resolver<Array<ResolversTypes['LiveRoomEdge']>, ParentType, ContextType>;
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>;
};

export type LiveRoomEdgeResolvers<ContextType = LiveStateGraphqlContext, ParentType extends ResolversParentTypes['LiveRoomEdge'] = ResolversParentTypes['LiveRoomEdge']> = {
  cursor?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  node?: Resolver<ResolversTypes['LiveRoom'], ParentType, ContextType>;
};

export type LiveStateDocumentResolvers<ContextType = LiveStateGraphqlContext, ParentType extends ResolversParentTypes['LiveStateDocument'] = ResolversParentTypes['LiveStateDocument']> = {
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  namespace?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  payload?: Resolver<ResolversTypes['JSON'], ParentType, ContextType>;
  revision?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  version?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type LiveStateFactResolvers<ContextType = LiveStateGraphqlContext, ParentType extends ResolversParentTypes['LiveStateFact'] = ResolversParentTypes['LiveStateFact']> = {
  booleanValue?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  key?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  namespace?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  numberValue?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  stringValue?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  type?: Resolver<ResolversTypes['LiveStateFactType'], ParentType, ContextType>;
};

export type MutationResolvers<ContextType = LiveStateGraphqlContext, ParentType extends ResolversParentTypes['Mutation'] = ResolversParentTypes['Mutation']> = {
  enqueueLiveRoomCommand?: Resolver<ResolversTypes['LiveRoomCommand'], ParentType, ContextType, RequireFields<MutationEnqueueLiveRoomCommandArgs, 'input'>>;
};

export type PageInfoResolvers<ContextType = LiveStateGraphqlContext, ParentType extends ResolversParentTypes['PageInfo'] = ResolversParentTypes['PageInfo']> = {
  endCursor?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  hasNextPage?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
};

export type QueryResolvers<ContextType = LiveStateGraphqlContext, ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query']> = {
  liveRoom?: Resolver<Maybe<ResolversTypes['LiveRoom']>, ParentType, ContextType, RequireFields<QueryLiveRoomArgs, 'id'>>;
  liveRoomCommands?: Resolver<ResolversTypes['LiveRoomCommandConnection'], ParentType, ContextType, RequireFields<QueryLiveRoomCommandsArgs, 'first' | 'roomId'>>;
  liveRooms?: Resolver<ResolversTypes['LiveRoomConnection'], ParentType, ContextType, RequireFields<QueryLiveRoomsArgs, 'first'>>;
};

export type Resolvers<ContextType = LiveStateGraphqlContext> = {
  DateTime?: GraphQLScalarType;
  JSON?: GraphQLScalarType;
  LiveNativeRoom?: LiveNativeRoomResolvers<ContextType>;
  LiveNativeScore?: LiveNativeScoreResolvers<ContextType>;
  LivePlayer?: LivePlayerResolvers<ContextType>;
  LivePlayerConnection?: LivePlayerConnectionResolvers<ContextType>;
  LivePlayerEdge?: LivePlayerEdgeResolvers<ContextType>;
  LiveRoom?: LiveRoomResolvers<ContextType>;
  LiveRoomCommand?: LiveRoomCommandResolvers<ContextType>;
  LiveRoomCommandConnection?: LiveRoomCommandConnectionResolvers<ContextType>;
  LiveRoomCommandEdge?: LiveRoomCommandEdgeResolvers<ContextType>;
  LiveRoomConnection?: LiveRoomConnectionResolvers<ContextType>;
  LiveRoomEdge?: LiveRoomEdgeResolvers<ContextType>;
  LiveStateDocument?: LiveStateDocumentResolvers<ContextType>;
  LiveStateFact?: LiveStateFactResolvers<ContextType>;
  Mutation?: MutationResolvers<ContextType>;
  PageInfo?: PageInfoResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
};

