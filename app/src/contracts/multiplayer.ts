// DRAFT: 待主干评审

import type { ReforgedChatRole, ReforgedGenerationApi } from './engine';

// DRAFT: 待主干评审
export type RoomId = string;

// DRAFT: 待主干评审
export type RoomInviteCode = string;

// DRAFT: 待主干评审
export type ParticipantId = string;

// DRAFT: 待主干评审
export type RoomEventId = string;

// DRAFT: 待主干评审
export type RoomMessageId = string;

// DRAFT: 待主干评审
export type GenerationRequestId = string;

// DRAFT: 待主干评审
export type ParticipantKeyRef = string;

// DRAFT: 待主干评审
export type RoomSeq = number;

// DRAFT: 待主干评审
export type RoomRevision = number;

// DRAFT: 待主干评审
export type IsoDateTimeString = string;

// DRAFT: 待主干评审
export type ParticipantRole = 'host' | 'participant' | 'system';

// DRAFT: 待主干评审
export type ParticipantPresence = 'online' | 'away' | 'offline' | 'left' | 'kicked';

// DRAFT: 待主干评审
export type RoomAccessMode = 'password';

// DRAFT: 待主干评审
export type RoomMessageStatus = 'sent' | 'edited' | 'deleted' | 'generating' | 'failed';

// DRAFT: 待主干评审
export type GenerationStatusState = 'queued' | 'running' | 'streaming' | 'completed' | 'cancelled' | 'failed';

// DRAFT: 待主干评审
export type RoomEventType =
    | 'room.created'
    | 'participant.joined'
    | 'participant.updated'
    | 'participant.left'
    | 'chat.appended'
    | 'chat.edited'
    | 'chat.deleted'
    | 'chat.swipe-selected'
    | 'generation.requested'
    | 'generation.status'
    | 'generation.chunk'
    | 'generation.completed'
    | 'generation.cancelled'
    | 'generation.failed';

// DRAFT: 待主干评审
export interface RoomJoinRequest {
    roomId?: RoomId;
    inviteCode?: RoomInviteCode;
    roomLink?: string;
    nickname: string;
    password: string;
    clientInstanceId?: string;
    resumeToken?: string;
}

// DRAFT: 待主干评审
export interface RoomJoinResult {
    roomId: RoomId;
    participantId: ParticipantId;
    resumeToken: string;
    snapshot: RoomSnapshot;
}

// DRAFT: 待主干评审
export interface RoomLink {
    roomId: RoomId;
    inviteCode: RoomInviteCode;
    url: string;
    expiresAt?: IsoDateTimeString;
}

// DRAFT: 待主干评审
export interface RoomMetadata {
    id: RoomId;
    title: string;
    accessMode: RoomAccessMode;
    link?: RoomLink;
    createdAt: IsoDateTimeString;
    updatedAt: IsoDateTimeString;
    createdBy: ParticipantId | 'system';
}

// DRAFT: 待主干评审
export interface ParticipantKeyState {
    keyRef: ParticipantKeyRef;
    ownerParticipantId: ParticipantId;
    provider: ReforgedGenerationApi;
    baseUrl: string;
    model: string;
    hasKey: boolean;
    maskedLabel: string;
    updatedAt: IsoDateTimeString;
}

// DRAFT: 待主干评审
export interface ParticipantPublicProfile {
    id: ParticipantId;
    nickname: string;
    role: ParticipantRole;
    presence: ParticipantPresence;
    joinedAt: IsoDateTimeString;
    lastSeenAt?: IsoDateTimeString;
    canGenerate: boolean;
    keyState?: ParticipantKeyState;
}

// DRAFT: 待主干评审
export interface RoomMessageAlternative {
    id: string;
    content: string;
    authorId: ParticipantId | 'assistant' | 'system';
    createdAt: IsoDateTimeString;
    seq: RoomSeq;
}

// DRAFT: 待主干评审
export interface RoomChatMessage {
    id: RoomMessageId;
    role: Extract<ReforgedChatRole, 'system' | 'user' | 'assistant'>;
    content: string;
    authorId: ParticipantId | 'assistant' | 'system';
    status: RoomMessageStatus;
    createdAt: IsoDateTimeString;
    updatedAt?: IsoDateTimeString;
    seq: RoomSeq;
    revision: RoomRevision;
    alternatives: RoomMessageAlternative[];
    activeAlternativeId?: string;
    deletedAt?: IsoDateTimeString;
}

// DRAFT: 待主干评审
export interface GenerationProviderPublicConfig {
    api: ReforgedGenerationApi;
    baseUrl: string;
    model: string;
    keyRef: ParticipantKeyRef;
}

// DRAFT: 待主干评审
export interface GenerationRequest {
    id: GenerationRequestId;
    roomId: RoomId;
    triggerParticipantId: ParticipantId;
    provider: GenerationProviderPublicConfig;
    contextRevision: RoomRevision;
    targetMessageId?: RoomMessageId;
    characterId?: string;
    sampling?: Record<string, unknown> | null;
    requestedAt: IsoDateTimeString;
}

// DRAFT: 待主干评审
export interface GenerationStatus {
    requestId: GenerationRequestId;
    roomId: RoomId;
    state: GenerationStatusState;
    triggerParticipantId: ParticipantId;
    provider: GenerationProviderPublicConfig;
    contextRevision: RoomRevision;
    outputMessageId?: RoomMessageId;
    startedAt?: IsoDateTimeString;
    updatedAt: IsoDateTimeString;
    finishedAt?: IsoDateTimeString;
    error?: RoomPublicError;
}

// DRAFT: 待主干评审
export interface RoomPublicError {
    code: string;
    message: string;
    retryable?: boolean;
}

// DRAFT: 待主干评审
export interface RoomSnapshot {
    room: RoomMetadata;
    participants: ParticipantPublicProfile[];
    messages: RoomChatMessage[];
    activeGenerations: GenerationStatus[];
    latestSeq: RoomSeq;
    revision: RoomRevision;
    serverTime: IsoDateTimeString;
}

// DRAFT: 待主干评审
export interface RoomEventBase {
    id: RoomEventId;
    roomId: RoomId;
    type: RoomEventType;
    seq: RoomSeq;
    revision: RoomRevision;
    actorId: ParticipantId | 'system';
    createdAt: IsoDateTimeString;
}

// DRAFT: 待主干评审
export interface RoomCreatedEvent extends RoomEventBase {
    type: 'room.created';
    room: RoomMetadata;
}

// DRAFT: 待主干评审
export interface ParticipantJoinedEvent extends RoomEventBase {
    type: 'participant.joined';
    participant: ParticipantPublicProfile;
}

// DRAFT: 待主干评审
export interface ParticipantUpdatedEvent extends RoomEventBase {
    type: 'participant.updated';
    participant: ParticipantPublicProfile;
}

// DRAFT: 待主干评审
export interface ParticipantLeftEvent extends RoomEventBase {
    type: 'participant.left';
    participantId: ParticipantId;
    presence: Extract<ParticipantPresence, 'offline' | 'left' | 'kicked'>;
}

// DRAFT: 待主干评审
export interface ChatAppendEvent extends RoomEventBase {
    type: 'chat.appended';
    message: RoomChatMessage;
}

// DRAFT: 待主干评审
export interface ChatEditedEvent extends RoomEventBase {
    type: 'chat.edited';
    messageId: RoomMessageId;
    content: string;
    updatedAt: IsoDateTimeString;
}

// DRAFT: 待主干评审
export interface ChatDeletedEvent extends RoomEventBase {
    type: 'chat.deleted';
    messageId: RoomMessageId;
    deletedAt: IsoDateTimeString;
}

// DRAFT: 待主干评审
export interface ChatSwipeSelectedEvent extends RoomEventBase {
    type: 'chat.swipe-selected';
    messageId: RoomMessageId;
    activeAlternativeId: string;
}

// DRAFT: 待主干评审
export interface GenerationRequestedEvent extends RoomEventBase {
    type: 'generation.requested';
    request: GenerationRequest;
}

// DRAFT: 待主干评审
export interface GenerationStatusEvent extends RoomEventBase {
    type: 'generation.status';
    status: GenerationStatus;
}

// DRAFT: 待主干评审
export interface GenerationChunkEvent extends RoomEventBase {
    type: 'generation.chunk';
    requestId: GenerationRequestId;
    outputMessageId: RoomMessageId;
    delta: string;
}

// DRAFT: 待主干评审
export interface GenerationCompletedEvent extends RoomEventBase {
    type: 'generation.completed';
    status: GenerationStatus & { state: 'completed' };
    message: RoomChatMessage;
}

// DRAFT: 待主干评审
export interface GenerationCancelledEvent extends RoomEventBase {
    type: 'generation.cancelled';
    status: GenerationStatus & { state: 'cancelled' };
}

// DRAFT: 待主干评审
export interface GenerationFailedEvent extends RoomEventBase {
    type: 'generation.failed';
    status: GenerationStatus & { state: 'failed'; error: RoomPublicError };
}

// DRAFT: 待主干评审
export type RoomEvent =
    | RoomCreatedEvent
    | ParticipantJoinedEvent
    | ParticipantUpdatedEvent
    | ParticipantLeftEvent
    | ChatAppendEvent
    | ChatEditedEvent
    | ChatDeletedEvent
    | ChatSwipeSelectedEvent
    | GenerationRequestedEvent
    | GenerationStatusEvent
    | GenerationChunkEvent
    | GenerationCompletedEvent
    | GenerationCancelledEvent
    | GenerationFailedEvent;

// DRAFT: 待主干评审
export interface RoomEventPage {
    roomId: RoomId;
    fromSeqExclusive: RoomSeq;
    events: RoomEvent[];
    latestSeq: RoomSeq;
    revision: RoomRevision;
}

// DRAFT: 待主干评审
export interface RoomSyncRequest {
    roomId: RoomId;
    afterSeq: RoomSeq;
}

// DRAFT: 待主干评审
export interface ChatAppendRequest {
    roomId: RoomId;
    clientMessageId?: string;
    content: string;
}

// DRAFT: 待主干评审
export interface ChatEditRequest {
    roomId: RoomId;
    messageId: RoomMessageId;
    content: string;
    expectedRevision?: RoomRevision;
}

// DRAFT: 待主干评审
export interface ChatDeleteRequest {
    roomId: RoomId;
    messageId: RoomMessageId;
    expectedRevision?: RoomRevision;
}

// DRAFT: 待主干评审
export interface GenerationCancelRequest {
    roomId: RoomId;
    requestId: GenerationRequestId;
}

// DRAFT: 待主干评审
export interface ParticipantPresenceRequest {
    roomId: RoomId;
    presence: Extract<ParticipantPresence, 'online' | 'away'>;
}

// DRAFT: 待主干评审
export interface ParticipantKeySubmitRequest {
    roomId: RoomId;
    participantId: ParticipantId;
    provider: Omit<GenerationProviderPublicConfig, 'keyRef'>;
    apiKey: string;
    persistForRoom?: boolean;
}

// DRAFT: 待主干评审
export interface ParticipantKeySubmitResult {
    roomId: RoomId;
    participantId: ParticipantId;
    keyState: ParticipantKeyState;
}

// DRAFT: 待主干评审
export type RoomClientPayload =
    | { type: 'room.sync'; request: RoomSyncRequest }
    | { type: 'chat.append'; request: ChatAppendRequest }
    | { type: 'chat.edit'; request: ChatEditRequest }
    | { type: 'chat.delete'; request: ChatDeleteRequest }
    | { type: 'generation.request'; request: GenerationRequest }
    | { type: 'generation.cancel'; request: GenerationCancelRequest }
    | { type: 'participant.presence'; request: ParticipantPresenceRequest };

// DRAFT: 待主干评审
export type RoomServerPayload =
    | { type: 'room.snapshot'; snapshot: RoomSnapshot }
    | { type: 'room.events'; page: RoomEventPage }
    | { type: 'room.event'; event: RoomEvent }
    | { type: 'generation.status'; status: GenerationStatus }
    | { type: 'room.error'; error: RoomPublicError; seq?: RoomSeq; revision?: RoomRevision };
