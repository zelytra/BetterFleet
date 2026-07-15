export interface PublicSession {
  sessionId: string;
  region: string;
  admin: string[];
  name: string;
  playerAmount: number;
  isPrivate: boolean;
  banner: number;
}
