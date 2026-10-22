/**
 * Unit tests for server-side review approval storage.
 * Run: npx ts-node --transpile-only src/approvalStore.test.ts
 */
import { approvalStore } from './approvalStore';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERT: ${message}`);
}

function run(): void {
  const args: Record<string, unknown> = {
    owner: 'example-owner',
    repo: 'example-repo',
    pullNumber: 12,
    commentBody: 'Reviewed comment',
  };

  const created = approvalStore.create(
    'github:user-1:session:s1',
    'github_post_comment',
    args,
    'Reviewed comment'
  );

  assert(/^[a-f0-9]{48}$/.test(created.id), 'approval id should be a high-entropy hex token');
  assert(approvalStore.consume(created.id, 'github:user-2:session:s1') === null,
    'an approval must not be consumable by another user');
  assert(approvalStore.consume(created.id, 'github:user-1:session:s2') === null,
    'an approval must not be consumable from another session');

  const consumed = approvalStore.consume(created.id, 'github:user-1:session:s1');
  assert(consumed !== null, 'the owning user/session should be able to consume the approval');
  assert(consumed?.arguments.pullNumber === 12, 'the stored PR number should be preserved');
  assert(approvalStore.consume(created.id, 'github:user-1:session:s1') === null,
    'an approval must be one-shot and cannot be replayed');

  const secondArgs: Record<string, unknown> = { pullNumber: 3, commentBody: 'Original' };
  const second = approvalStore.create('session:s3', 'github_post_comment', secondArgs, 'Original');
  secondArgs.pullNumber = 999;
  secondArgs.commentBody = 'Tampered client input';
  const secondConsumed = approvalStore.consume(second.id, 'session:s3');
  assert(secondConsumed?.arguments.pullNumber === 3,
    'mutating the caller-owned arguments must not change stored arguments');
  assert(secondConsumed?.arguments.commentBody === 'Original',
    'the stored comment body must be independent from caller-owned arguments');

  console.log('approvalStore.test.ts: all assertions passed');
}

try {
  run();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
