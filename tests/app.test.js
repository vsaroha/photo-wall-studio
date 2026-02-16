const test = require('node:test');
const assert = require('node:assert/strict');

const { createAppContext } = require('./helpers/load-app-context');

test('keepPhotoInCanvas clamps photo size and coordinates', () => {
  const app = createAppContext();

  app.run('currentCanvas = { w: 8, h: 6 };');
  app.run('globalThis.__photo = { x: -2, y: 10, w: 12, h: 9 };');
  app.run('keepPhotoInCanvas(globalThis.__photo);');

  const photo = app.json('globalThis.__photo');
  assert.deepEqual(photo, { x: 0, y: 0, w: 8, h: 6 });
});

test('findManualPlacement returns first available non-overlapping spot', () => {
  const app = createAppContext();

  app.run('placedPhotos = [{ id: 1, entryId: 1, x: 2, y: 2, w: 2, h: 2, rotated: false, color: "#000" }];');
  app.run('document.getElementById("snapToGrid").checked = false;');
  app.run('document.getElementById("spacing").value = "1";');

  const pos = app.json('findManualPlacement(2, 2, 1)');
  assert.deepEqual(pos, { x: 4, y: 1 });
});

test('distributeEvenly spreads items into balanced buckets', () => {
  const app = createAppContext();

  const buckets = app.json('distributeEvenly([1, 2, 3, 4, 5], 2)');
  assert.deepEqual(buckets, [[1, 2, 3], [4, 5]]);
});

test('shuffleWithSeed is deterministic and preserves order for seed 0', () => {
  const app = createAppContext();

  const shuffledA = app.json('shuffleWithSeed([1,2,3,4,5,6,7,8], 42)');
  const shuffledB = app.json('shuffleWithSeed([1,2,3,4,5,6,7,8], 42)');
  const seedZero = app.json('shuffleWithSeed([1,2,3], 0)');

  assert.deepEqual(shuffledA, shuffledB);
  assert.deepEqual(seedZero, [1, 2, 3]);
  assert.notDeepEqual(shuffledA, [1, 2, 3, 4, 5, 6, 7, 8]);
});

test('removePhotosByIds keeps photo entries and placed photos in sync', () => {
  const app = createAppContext();

  app.run(`
    photoEntries = [
      { id: 11, w: 4, h: 6, qty: 2, color: '#111' },
      { id: 22, w: 5, h: 7, qty: 1, color: '#222' }
    ];
    placedPhotos = [
      { id: 101, entryId: 11, x: 0, y: 0, w: 4, h: 6, rotated: false, color: '#111' },
      { id: 102, entryId: 11, x: 5, y: 0, w: 4, h: 6, rotated: false, color: '#111' },
      { id: 201, entryId: 22, x: 0, y: 7, w: 5, h: 7, rotated: false, color: '#222' }
    ];
    selectedIds = [101, 201];
    selectedId = 201;
    removePhotosByIds([101, 201]);
  `);

  const entries = app.json('photoEntries');
  const photos = app.json('placedPhotos');
  const selectedIds = app.json('selectedIds');
  const selectedId = app.run('selectedId');

  assert.deepEqual(entries, [{ id: 11, w: 4, h: 6, qty: 1, color: '#111' }]);
  assert.deepEqual(photos, [{ id: 102, entryId: 11, x: 5, y: 0, w: 4, h: 6, rotated: false, color: '#111' }]);
  assert.deepEqual(selectedIds, []);
  assert.equal(selectedId, null);
});

test('moveSelectedPhotosBy nudges all selected photos together', () => {
  const app = createAppContext();

  app.run(`
    currentCanvas = { w: 20, h: 20 };
    placedPhotos = [
      { id: 1, entryId: 11, x: 2, y: 4, w: 3, h: 2, rotated: false, color: '#111' },
      { id: 2, entryId: 11, x: 8, y: 7, w: 2, h: 3, rotated: false, color: '#111' }
    ];
    selectedIds = [1, 2];
    selectedId = 2;
  `);

  const moved = app.run('moveSelectedPhotosBy(1, -1)');
  const photos = app.json('placedPhotos.map((p) => ({ id: p.id, x: p.x, y: p.y }))');

  assert.equal(moved, true);
  assert.deepEqual(photos, [
    { id: 1, x: 3, y: 3 },
    { id: 2, x: 9, y: 6 }
  ]);
});

test('moveSelectedPhotosBy blocks movement when selection is against canvas edge', () => {
  const app = createAppContext();

  app.run(`
    currentCanvas = { w: 10, h: 10 };
    placedPhotos = [
      { id: 1, entryId: 11, x: 0, y: 3, w: 3, h: 2, rotated: false, color: '#111' },
      { id: 2, entryId: 11, x: 5, y: 3, w: 2, h: 2, rotated: false, color: '#111' }
    ];
    selectedIds = [1, 2];
    selectedId = 2;
  `);

  const moved = app.run('moveSelectedPhotosBy(-1, 0)');
  const photos = app.json('placedPhotos.map((p) => ({ id: p.id, x: p.x, y: p.y }))');

  assert.equal(moved, false);
  assert.deepEqual(photos, [
    { id: 1, x: 0, y: 3 },
    { id: 2, x: 5, y: 3 }
  ]);
});
