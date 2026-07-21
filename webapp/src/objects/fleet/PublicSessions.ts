export interface PublicSession {
  /**
   * Stable identity for this row, unrelated to the join code. A private session withholds its
   * code, so this is the only thing that can key — and animate — its row.
   */
  directoryId: string;
  /** The joinable code. Empty for a private session: only the host can hand it out. */
  sessionId: string;
  region: string;
  admin: string[];
  /** The master's custom name, or the pirate-name seed as digits, which the client localizes. */
  name: string;
  playerAmount: number;
  isPrivate: boolean;
  banner: number;
}
