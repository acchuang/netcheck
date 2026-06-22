export interface AiBinding {
  run(
    model: string,
    options: { messages?: unknown; prompt?: string; max_tokens?: number; temperature?: number },
  ): Promise<unknown>;
}

export interface Env {
  ANALYTICS: KVNamespace;
  PING_WNAM: R2Bucket;
  PING_ENAM: R2Bucket;
  PING_WEUR: R2Bucket;
  PING_EEUR: R2Bucket;
  PING_APAC: R2Bucket;
  PING_OC: R2Bucket;
  AI: AiBinding;
}

export interface CfProperties {
  colo?: string;
  asn?: number;
  asOrganization?: string;
  city?: string;
  region?: string;
  timezone?: string;
  latitude?: string;
  longitude?: string;
  httpProtocol?: string;
  tlsVersion?: string;
  tlsCipher?: string;
  clientTcpRtt?: number;
}