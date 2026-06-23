import { observable } from './observable';

export interface CspIssue {
  severity: 'high' | 'medium' | 'low' | 'info';
  directive: string;
  value: string;
  message: string;
}

export interface CspAnalysis {
  present: boolean;
  raw: string | null;
  directives: { name: string; values: string[] }[];
  issues: CspIssue[];
  score: number;
  grade: string;
}

export interface HeaderCheckResult {
  name: string;
  key: string;
  desc: string;
  value: string | null;
  present: boolean;
  quality?: 'good' | 'warn' | 'poor';
  qualityNote?: string;
}

export interface HeaderSuggestion {
  header: string;
  severity: 'critical' | 'important' | 'info';
  message: string;
  fix: string;
  url: string;
}

export interface PermissionsPolicyIssue {
  severity: 'high' | 'medium' | 'low';
  directive: string;
  value: string;
  message: string;
}

export interface PermissionsPolicyAnalysis {
  present: boolean;
  raw: string | null;
  directives: { name: string; values: string[] }[];
  issues: PermissionsPolicyIssue[];
  score: number;
  grade: string;
}

export const headersState = {
  url: observable<string>(''),
  grade: observable<string>(''),
  score: observable<number>(0),
  checks: observable<HeaderCheckResult[]>([]),
  cspAnalysis: observable<CspAnalysis | null>(null),
  loading: observable<boolean>(false),
};
