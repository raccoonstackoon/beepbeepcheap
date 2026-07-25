import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import { createFocusedImage, selectAvailableAnthropicModel } from '../src/services/imageProcessor.js';

test('prefers a configured Anthropic model when it is available', () => {
  assert.equal(
    selectAvailableAnthropicModel(
      ['claude-sonnet-5', 'claude-haiku-4-5-20251001'],
      'claude-haiku-4-5-20251001'
    ),
    'claude-haiku-4-5-20251001'
  );
});

test('falls back from a retired Anthropic model to an available current model', () => {
  assert.equal(
    selectAvailableAnthropicModel(
      ['claude-opus-5', 'claude-sonnet-5'],
      'claude-opus-4-20250514'
    ),
    'claude-sonnet-5'
  );
});

test('creates a Lens image from the user-circled focus area', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'beepbeep-focus-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const inputPath = path.join(directory, 'photo.jpg');
  await sharp({
    create: {
      width: 200,
      height: 100,
      channels: 3,
      background: '#ff6600',
    },
  }).jpeg().toFile(inputPath);

  const focusedPath = await createFocusedImage(inputPath, {
    x: 25,
    y: 0,
    width: 50,
    height: 100,
  });
  const metadata = await sharp(focusedPath).metadata();
  assert.equal(metadata.width, 100);
  assert.equal(metadata.height, 100);
});
