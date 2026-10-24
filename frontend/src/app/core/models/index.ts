export type AppRole = 'USER' | 'ADMIN';

export type MeetingParticipantStatus = 'INVITED' | 'ACCEPTED' | 'DECLINED';
export type RecurrenceScope = 'this' | 'all' | 'future';
export type RecurrenceType = 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';

export interface UserSummary {
  id: number;
  name: string;
  email: string;
  avatar: string | null;
  firstName: string | null;
  lastName: string | null;
  role?: string;
}

export interface ParticipantInfo extends UserSummary {
  status: MeetingParticipantStatus;
  meetingParticipantId: number;
}

export interface RoomSummary {
  id: number;
  title: string;
  slug: string;
  isActive: boolean;
  isPrivate?: boolean;
}

export interface Meetup {
  id: number;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string;
  createdAt: string;
  hostId: number;
  roomId: number | null;
  host?: UserSummary;
  participants?: ParticipantInfo[];
  room?: RoomSummary | null;
  recurrenceType: RecurrenceType | null;
  recurrenceEndDate: string | null;
  parentMeetingId: number | null;
}

export interface UserCredentials {
  name?: string;
  email: string;
  password: string;
}

export interface UserProfile {
  id: number;
  email: string;
  name: string;
  role: string;
  firstName: string | null;
  lastName: string | null;
  birthDate: string | null;
  avatar: string | null;
  createdAt: string;
}

export interface ProfileUpdatePayload {
  firstName?: string | null;
  lastName?: string | null;
  birthDate?: string | null;
  avatar?: string | null;
}

export interface PasswordChangePayload {
  currentPassword: string;
  newPassword: string;
}

export interface Room {
  id: number;
  title: string;
  slug: string;
  isActive: boolean;
  isPrivate?: boolean;
  hostId: number;
  createdAt: string;
  host?: { id: number; name: string; email: string };
}

export interface Participant {
  socketId: string;
  userId?: string;
  userName: string;
  displayName: string;
  initials: string;
  avatar: string | null;
  stream?: MediaStream;
  isMuted: boolean;
  isVideoOff: boolean;
  isScreenSharing: boolean;
}

export interface Tag {
  id: number;
  name: string;
}

export interface ContentFile {
  id: number;
  contentId: number;
  fileName: string;
  filePath: string;
  fileSize: number | null;
  createdAt: string;
}

export interface ContentItem {
  id: number;
  title: string;
  type: string;
  body: string | null;
  mediaUrl: string | null;
  fileName: string | null;
  authorId: number;
  createdAt: string;
  author?: { id: number; name: string; avatar: string | null };
  tags?: Tag[];
  files?: ContentFile[];
  isFavorited?: boolean;
}

export interface AdminStats {
  totals: {
    users: number;
    content: number;
    meetings: number;
    files: number;
    totalStorage: number;
  };
  usersByDay: { date: string; count: number }[];
  contentByType: { type: string; count: number }[];
  topAuthors: { id: number; name: string; avatar: string | null; count: number }[];
  contentByTag: { tagId: number; tagName: string; count: number }[];
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface SignalingPayload {
  target: string;
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

export interface AuthResponse {
  token: string;
  refreshToken: string;
  userId: number;
  role?: string;
  message?: string;
}

export interface ApiMessage {
  message: string;
}

export interface ChatMessage {
  id: string;
  socketId: string;
  text: string;
  userName: string;
  initials: string;
  avatar: string | null;
  timestamp: string;
}

export interface MediaStatePayload {
  muted: boolean;
  videoOff: boolean;
}

export interface UserInfoPayload {
  name: string;
  init: string;
  avatar?: string | null;
}

export interface MeetupCreatePayload {
  title: string;
  description?: string | null;
  startTime: string;
  endTime: string;
  roomId?: number | null;
  participantIds?: number[];
  recurrenceType?: RecurrenceType | null;
  recurrenceEndDate?: string | null;
}

export interface MeetupUpdatePayload {
  title?: string;
  description?: string | null;
  startTime?: string;
  endTime?: string;
  roomId?: number | null;
  participantIds?: number[];
  scope?: RecurrenceScope;
  recurrenceType?: RecurrenceType | null;
  recurrenceEndDate?: string | null;
}

export interface CreateRoomPayload {
  title: string;
  slug: string;
  password?: string;
  isPrivate?: boolean;
}

export interface ContentCreatePayload {
  title: string;
  type: string;
  body?: string | null;
  mediaUrl?: string | null;
  tagIds?: number[];
  file?: File | null;
  files?: File[];
}

export interface ContentUpdatePayload {
  title?: string;
  type?: string;
  body?: string | null;
  mediaUrl?: string | null;
  tagIds?: number[];
  file?: File | null;
  files?: File[];
}

export interface ContentQueryParams {
  page: number;
  limit: number;
  sortBy: string;
  sortOrder: string;
  tagId?: number;
  favorites?: string;
}

export interface UserQueryParams {
  page: number;
  limit: number;
  sortBy: string;
  sortOrder: string;
  search?: string;
}

export interface MeetupQueryParams {
  page: number;
  limit: number;
  userIds?: string;
}
