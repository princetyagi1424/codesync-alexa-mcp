/**
 * Lightweight unit tests for static analysis (no external services).
 * Run: npx ts-node --transpile-only src/staticAnalysis.test.ts
 * Exit code 0 = pass, 1 = fail.
 */
import { GitHubService, DiffFile } from './githubService';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`ASSERT: ${message}`);
  }
}

function run(): void {
  const svc = new GitHubService();

  // 1) Detect hardcoded secret patterns on added lines only
  {
    const files: DiffFile[] = [
      {
        filename: 'src/config.ts',
        status: 'modified',
        additions: 1,
        deletions: 0,
        changes: 1,
        patch: [
          '@@ -1,3 +1,4 @@',
          ' export const config = {',
          "+  apiKey: 'sk-abcdefghijklmnopqrstuvwxyz012345',",
          ' };',
        ].join('\n'),
      },
    ];
    const result = svc.runStaticAnalysis(files);
    assert(result.findings.some((f) => f.type === 'secret'), 'should detect secret-like API key');
    assert(result.score < 100, 'score should drop when critical findings exist');
  }

  // 2) Detect console.log on added lines
  {
    const files: DiffFile[] = [
      {
        filename: 'src/debug.ts',
        status: 'added',
        additions: 1,
        deletions: 0,
        changes: 1,
        patch: '@@ -0,0 +1,1 @@\n+console.log("debug", secret);',
      },
    ];
    const result = svc.runStaticAnalysis(files);
    assert(
      result.findings.some((f) => f.type === 'console_log'),
      'should detect console.log'
    );
  }

  // 3) Ignore context / removed lines for secret patterns
  {
    const files: DiffFile[] = [
      {
        filename: 'src/old.ts',
        status: 'modified',
        additions: 0,
        deletions: 1,
        changes: 1,
        patch: [
          '@@ -1,2 +1,1 @@',
          "-  password: 'supersecretvalue',",
          '   ok: true,',
        ].join('\n'),
      },
    ];
    const result = svc.runStaticAnalysis(files);
    assert(
      !result.findings.some((f) => f.type === 'secret'),
      'should not flag secrets only present on removed lines'
    );
  }

  // 4) Clean diff → score 100 and empty findings
  {
    const files: DiffFile[] = [
      {
        filename: 'src/math.ts',
        status: 'added',
        additions: 2,
        deletions: 0,
        changes: 2,
        patch: '@@ -0,0 +1,2 @@\n+export function add(a: number, b: number) {\n+  return a + b;\n+}',
      },
    ];
    const result = svc.runStaticAnalysis(files);
    assert(result.findings.length === 0, 'clean code should have zero findings');
    assert(result.score === 100, 'clean code score should be 100');
  }

  // 5) GitHub PAT pattern
  {
    const files: DiffFile[] = [
      {
        filename: 'src/token.ts',
        status: 'added',
        additions: 1,
        deletions: 0,
        changes: 1,
        patch:
          '@@ -0,0 +1,1 @@\n+const credential = "ghp_abcdefghijklmnopqrstuvwxyz0123456789";',
      },
    ];
    const result = svc.runStaticAnalysis(files);
    assert(
      result.findings.some((f) => f.type === 'secret' && /GitHub/i.test(f.message)),
      'should detect GitHub PAT pattern'
    );
  }

  console.log('staticAnalysis.test.ts: all assertions passed');
}

try {
  run();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
