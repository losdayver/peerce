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

export interface PeerToPeerMessage {
  fileName: string;
  payload: string; // base64
  chunkNo: number;
  totalNo: number;
}

// env
export interface SimpleProtocolConfig
  extends
    SimpleProtocolRelayConfig,
    SimpleProtocolPeerConfig,
    SimpleProtocolPeerExchange {}

export interface SimpleProtocolPeerConfig {
  relayAddr?: string;
  relayPort?: number;
  selfTag?: string;
  distantTag?: string;
}

export interface SimpleProtocolPeerExchange {
  payload?: string | Buffer;
  fromFile?: string;
  outDir?: string;
}

export interface SimpleProtocolRelayConfig {
  selfAddr?: string;
  selfPort?: number;
}

export interface PeerToPeerMessageDescriptor {
  // mimetype
  fileName?: string;
  payload: Buffer | string;
}
