export const ALGORITHM_VERSIONS = ["v1", "v2"] as const;

export type AlgorithmVersion = (typeof ALGORITHM_VERSIONS)[number];
