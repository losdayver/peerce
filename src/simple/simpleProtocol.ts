export interface PeerToRelaySessionRequest {
  selfTag: string;
  distantTag: string;
}

export interface PeerToPeerSessionRequest {
  distantTag: string;
  distantAddress: string;
  distantPort: number;
}
