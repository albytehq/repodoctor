/**
 * RepoDoctor v0.1.0 — Public API
 *
 * This file exports only the stable public API. Internal modules
 * (ScannerEngine, ScoreCalculator, etc.) are intentionally NOT exported.
 *
 * Plugin authors should import from this module:
 *   import type { RepoDoctorPlugin, PluginScannerContext } from 'repodoctor';
 */

// Plugin API
export type { RepoDoctorPlugin, PluginScannerDefinition, PluginAnalyzerDefinition, PluginScannerContext, PluginAnalyzerContext, PluginFileSystem } from '@repodoctor/plugins/types';
export { PLUGIN_API_VERSION } from '@repodoctor/plugins/types';

// Core domain types
export type { RepositoryProfile, RepositoryType, PackageManager, Language, FrameworkGuess, DiscoveryResult, RepositoryFingerprint } from '@repodoctor/core/domain/Discovery';
export type { RawFact, ValidatedFact, ScanResult } from '@repodoctor/core/domain/Scan';
export type { RawFinding, ValidatedFinding, AnalysisResult } from '@repodoctor/core/domain/Analysis';
export type { MedicalDiagnosis, OrganDiagnosis, RuleWeight, FindingSeverity, OrganStatus, OverallStatus } from '@repodoctor/core/domain/Health';
export type { Treatment, TreatmentAction, FinalReport } from '@repodoctor/treatment/types';

// Config types
export type { RepoDoctorConfig, DiscoveryConfig, LogLevel } from '@repodoctor/config/types';

// Cache types
export type { CacheEntry, CacheFile, CacheLookupResult } from '@repodoctor/cache/types';
