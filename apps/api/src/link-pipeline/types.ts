export interface ExternalId {
  source: string;     // 'amazon' | 'mercadolivre' | 'kabum' | ...
  externalId: string; // the canonical product identifier within that source
}

export interface LinkPipelineResult {
  /** The final, affiliate-tagged URL to be stored and shown to users. */
  finalLinks: string[];
  /** All intermediate URL versions seen during processing (original, expanded, rewritten). */
  allVersions: string[];
  /** Canonical product identifiers extracted from the resolved URLs. */
  externalIds: ExternalId[];
}
