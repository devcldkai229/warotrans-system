const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mapRobotState,mapUpdateLabel,sampleAgeLabel}=require('./load-module.cjs')()('src/shared/maps/mapTelemetry.ts');
const now=Date.parse('2026-10-27T08:00:00Z');
const map={id:'v018',frameId:'map',imageWidthPixels:107,imageHeightPixels:68,resolution:0.05,originX:-0.594,originY:-2.719,originYaw:0};
const robot={currentMapVersionId:'v018',poseX:1,poseY:0,poseYaw:0,lastTelemetryAt:new Date(now-5000).toISOString(),isOnline:true,localizationStatus:'LOCALIZED'};

test('only a fresh, localized pose from the same map/frame can be followed',()=>{
  const state=mapRobotState(robot,map,now);
  assert.equal(state.canFollow,true);assert.equal(state.showPose,true);assert.equal(state.lastReported,false);assert.equal(state.ageSeconds,5);
  assert.equal(mapRobotState({...robot,currentMapVersionId:'v001'},map,now).showPose,false);
  assert.equal(mapRobotState(robot,{...map,frameId:'odom'},now).showPose,false);
});
test('offline, lost localization and stale samples retain the reported point without follow',()=>{
  for(const change of [{isOnline:false},{localizationStatus:'LOST'},{localizationStatus:'UNKNOWN'},{lastTelemetryAt:new Date(now-15001).toISOString()}]){
    const state=mapRobotState({...robot,...change},map,now);
    assert.equal(state.showPose,true);assert.equal(state.canFollow,false);assert.equal(state.lastReported,true);
  }
  assert.equal(mapRobotState(robot,map,now+11000).label,'Stale · Last Reported');
});
test('missing pose, invalid time, clock skew and out-of-bounds never imply a fresh valid robot',()=>{
  for(const change of [{poseX:NaN},{poseYaw:Infinity},{lastTelemetryAt:null}])assert.equal(mapRobotState({...robot,...change},map,now).showPose,false);
  for(const lastTelemetryAt of ['invalid',new Date(now+6000).toISOString()]){
    const state=mapRobotState({...robot,lastTelemetryAt},map,now);
    assert.equal(state.canFollow,false);assert.equal(state.ageSeconds,null);assert.equal(state.label,'Timestamp Unavailable');
  }
  const outside=mapRobotState({...robot,poseX:1000},map,now);
  assert.equal(outside.showPose,false);assert.equal(outside.canFollow,false);assert.equal(outside.label,'Out Of Bounds');
  assert.equal(sampleAgeLabel(null),'Time Unavailable');assert.equal(sampleAgeLabel(65),'1m ago');
});

test('live, fallback and interrupted updates keep freshness independent of socket connectivity',()=>{
  assert.equal(mapRobotState(robot,map,now,'live').label,'Live Position');
  assert.equal(mapRobotState(robot,map,now,'polling').label,'Pose Snapshot');
  assert.equal(mapUpdateLabel('polling'),'Polling · 5s');
  for(const mode of ['paused','unavailable']){
    const state=mapRobotState(robot,map,now,mode);
    assert.equal(state.canFollow,false); assert.equal(state.lastReported,true); assert.equal(state.showPose,true);
  }
  assert.equal(mapRobotState(robot,map,now+16000,'live').canFollow,false);
  assert.equal(mapRobotState({...robot,mapVersionCode:'old-map'},{...map,code:'new-map'},now,'live').showPose,false);
});
