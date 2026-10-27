const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./load-module.cjs');
const models = require('../src/shared/maps/rosMapModels.json');
const load = createLoader({ './rosMapModels.json': models });
const { findMapModel, mapViewport, displayPoint, mapHeading, mapRobotSnapshots, spacedLocations } = load('src/shared/maps/mapModel.ts');
const { zoneColor, zoneLabel } = load('src/shared/maps/mapPresentation.ts');
const { fitMapViewport, hasMapCalibration, resolveMapPreviewUri } = load('src/shared/utils/mapCoordinates.ts');
const modelMap = { ...models[0].geometry, contentHash: models[0].contentHash, frameId: 'map' };
const map = { imageWidthPixels: 234, imageHeightPixels: 164, resolution: 0.05, originX: -0.6, originY: -0.6, originYaw: 0 };

function close(a, b) { assert.ok(Math.abs(a-b) < 1e-7, `${a} != ${b}`); }

test('a model requires exact content identity, calibration and coordinate frame; names never identify geometry', () => {
  assert.equal(findMapModel({ ...modelMap, name: 'A renamed published map' }).key, 'sim_warehouse');
  for (const change of [{contentHash: null}, {contentHash: 'different-scan'}, {originX: 0}, {resolution: 0.1}, {imageWidthPixels: modelMap.imageWidthPixels+1}, {originYaw: Math.PI/2}, {frameId: 'odom'}]) {
    assert.equal(findMapModel({...modelMap,...change}), null);
  }
  const physical = models.find(m => m.key === 'warotrans_map3');
  const match = findMapModel({...physical.geometry,contentHash:physical.contentHash,frameId:'map'});
  assert.equal(match.key, 'warotrans_map3');
  assert.equal(match.shelves.length, 5);
  assert.equal(match.floorPaint, undefined);
});

test('the shared V018 snapshot matches the scan identity and the five source-map racks', () => {
  const published = require('../../samples/maps/MAP-WHSIM-V018/snapshot.json').mapVersion;
  const match = findMapModel({
    imageWidthPixels: published.image_width_pixels, imageHeightPixels: published.image_height_pixels,
    resolution: published.resolution, originX: published.origin_x, originY: published.origin_y,
    originYaw: published.origin_yaw, frameId: published.frame_id, contentHash: published.content_hash,
  });
  assert.equal(match.key, 'warotrans_map3');
  assert.equal(match.shelves.length, 5);
  assert.equal(match.shelves[0].code, 'SHELF-01');
  for (const shelf of match.shelves) {
    const view = mapViewport(match.geometry, 296, 430);
    assert.ok(displayPoint(shelf.x-shelf.sx/2, shelf.y-shelf.sy/2, match.geometry, view));
    assert.ok(displayPoint(shelf.x+shelf.sx/2, shelf.y+shelf.sy/2, match.geometry, view));
  }
});

test('junctions have a distinct label and map color from lanes and restricted areas', () => {
  assert.equal(zoneLabel('JUNCTION'), 'Junction');
  assert.equal(zoneLabel('SINGLE_OCCUPANCY'), 'Single Occupancy');
  for (const type of ['KEEP_OUT','NO_STOP','SPEED','SINGLE_OCCUPANCY']) assert.notEqual(zoneColor('JUNCTION'), zoneColor(type));
});

test('robot markers require a pose and map identity from the same valid snapshot', () => {
  const robot = { currentMapVersionId:'published-map', lastTelemetryAt:'2026-10-27T04:00:00Z',poseX:1,poseY:2,poseYaw:0 };
  const candidates = [robot,{...robot,currentMapVersionId:'other-map'},{...robot,lastTelemetryAt:null},{...robot,poseYaw:NaN},{...robot,poseX:Infinity}];
  assert.equal(mapRobotSnapshots(candidates,'published-map').length,1);
  assert.equal(mapRobotSnapshots(candidates,'published-map')[0],robot);
});

test('portrait projection rotates floor geometry and world poses together, preserving distances and headings', () => {
  const view = mapViewport(map, 296, 430);
  assert.equal(view.rotated, true);
  assert.ok(view.width <= 296 && view.height <= 430);
  close(view.width/view.height, 164/234);
  const origin = displayPoint(map.originX,map.originY,map,view);
  close(origin.x, 0); close(origin.y, 0);
  const a = displayPoint(3,3,map,view), b = displayPoint(4,3,map,view), c = displayPoint(3,4,map,view);
  close(b.x, a.x); close(b.y-a.y, view.scale/map.resolution);
  close(c.x-a.x, view.scale/map.resolution); close(c.y, a.y);
  assert.equal(mapHeading(0,0,true),180);
  assert.equal(mapHeading(Math.PI/2,0,true),90);
  close(mapHeading(Math.PI/2,Math.PI/2,true),180);
  assert.equal(displayPoint(100,100,map,view),null);
  const narrow = mapViewport(map,268,258,true);
  assert.equal(narrow.rotated,true);
  assert.ok(narrow.height <= 258 && narrow.width <=268);
  const landscape = mapViewport(map,720,200);
  assert.equal(landscape.rotated,false);
  close(landscape.width/landscape.height,234/164);
  assert.equal(mapViewport({...map,resolution:0},296,430).scale,0);
  assert.equal(mapViewport(map,296,-50).height,0);
});

test('map projection also preserves a nonzero ROS origin yaw when the mobile viewport is rotated', () => {
  const rotatedMap = {...map,originX:10,originY:20,originYaw:Math.PI/2};
  const view = mapViewport(rotatedMap,296,430);
  const p = displayPoint(8,23,rotatedMap,view);
  close(p.x,2/rotatedMap.resolution*view.scale);
  close(p.y,3/rotatedMap.resolution*view.scale);
});

test('decluttering retains distinct 44pt location hit areas and avoids the robot marker', () => {
  const locations = [{x:0,y:0,id:1},{x:20,y:0,id:2},{x:44,y:0,id:3},{x:100,y:100,id:4}];
  assert.deepEqual(Array.from(spacedLocations(locations,[{x:100,y:100}]),p=>p.id),[1,3]);
});

test('raster fitting and URL handling retain an honest fallback for unpublished or unknown model assets', () => {
  const fitted = fitMapViewport(map,296,120);
  assert.ok(fitted.width <= 296 && fitted.height <=120);
  close(fitted.width/fitted.height,234/164);
  assert.equal(hasMapCalibration({...map,originX:NaN}),false);
  assert.equal(resolveMapPreviewUri('/map-assets/map.png','http://localhost:5090/'),'http://localhost:5090/map-assets/map.png');
  assert.equal(resolveMapPreviewUri('https://assets.example/map.png','http://localhost:5090'),'https://assets.example/map.png');
  for (const uri of [null,undefined,'','pending://map.png','s3://private/map.png']) assert.equal(resolveMapPreviewUri(uri,'http://localhost:5090'),null);
});
