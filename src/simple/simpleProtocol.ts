// messages
export interface PeerToRelaySessionRequest {
  selfTag: string;
  distantTag: string;
}

export interface PeerToPeerSessionRequest {
  distantTag: string;
  distantAddress: string;
  distantPort: number;
}

// env
export interface SimpleProtocolClientConfig {
  relayAddr?: string;
  relayPort?: number;
  selfTag?: string;
  distantTag?: string;
  payload?: string | Buffer;
  fromFile?: string;
  outFile?: string;
}

export interface SimpleProtocolRelayConfig {
  selfAddr?: string;
  selfPort?: number;
}
