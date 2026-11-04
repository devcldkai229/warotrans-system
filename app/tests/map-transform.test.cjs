const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=require('./load-module.cjs')();
const {createMapFrame,worldToBase,baseToWorld,applyCamera,screenToWorld,zoomAtPoint,clampCamera,cameraForPoint,metricScale}=load('src/shared/maps/mapTransform.ts');
const {clipGridLine,mapGridLines}=load('src/shared/maps/mapGrid.ts');
const map={imageWidthPixels:107,imageHeightPixels:68,resolution:0.05,originX:-0.594,originY:-2.719,originYaw:0};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);

test('world/screen inverse preserves meters for portrait, landscape, negative origins and rotated frames',()=>{
  for(const originYaw of [0,Math.PI/3,-Math.PI/2])for(const [width,height] of [[280,430],[600,250],[320,320]]){
    const geometry={...map,originYaw},frame=createMapFrame(geometry,width,height);
    for(const point of [{x:-1.2,y:-2.1},{x:0,y:0},{x:4,y:0.2}]){
      const projected=worldToBase(point,geometry,frame);
      const restored=baseToWorld(projected,geometry,frame);
      near(restored.x,point.x);near(restored.y,point.y);
      const camera={zoom:3.7,x:-112,y:39};
      const hit=screenToWorld(applyCamera(projected,camera),geometry,frame,camera);
      near(hit.x,point.x);near(hit.y,point.y);
    }
  }
});

test('image Y inversion and portrait rotation have explicit known results',()=>{
  const f=createMapFrame(map,535,340),origin=worldToBase({x:map.originX,y:map.originY},map,f);
  near(origin.x,0);near(origin.y,340);
  const p=createMapFrame(map,340,535),rotated=worldToBase({x:map.originX,y:map.originY},map,p);
  assert.equal(p.rotated,true);near(rotated.x,0);near(rotated.y,0);
});

test('pinch and button zoom keep the world point under their focal point',()=>{
  const frame=createMapFrame(map,280,430),camera={zoom:2,x:-30,y:11},focal={x:90,y:143};
  const before=screenToWorld(focal,map,frame,camera),after=screenToWorld(focal,map,frame,zoomAtPoint(camera,5,focal));
  near(before.x,after.x);near(before.y,after.y);
  assert.equal(zoomAtPoint(camera,100,focal).zoom,8);
  assert.equal(zoomAtPoint(camera,0.1,focal).zoom,1);
});

test('bounds retain part of the map and center small axes; follow uses the available frame center',()=>{
  const frame=createMapFrame(map,280,430);
  const fit=clampCamera({zoom:1,x:10000,y:-10000},frame);near(fit.x,0);near(fit.y,0);
  const camera=clampCamera({zoom:4,x:10000,y:-10000},frame);
  const right=applyCamera({x:frame.left+frame.mapWidth,y:frame.top+frame.mapHeight},camera);
  const left=applyCamera({x:frame.left,y:frame.top},camera);
  assert.ok(right.y>=24&&left.x<=frame.width-24);
  const point={x:frame.width/2,y:frame.height/2},follow=cameraForPoint(point,{zoom:4,x:0,y:0},frame),screen=applyCamera(point,follow);
  near(screen.x,frame.width/2);near(screen.y,frame.height/2);
});

test('invalid calibration is rejected and the scale stays metric across zoom and map sizes',()=>{
  for(const change of [{resolution:0},{originYaw:NaN},{imageWidthPixels:0},{originX:Infinity}])assert.equal(createMapFrame({...map,...change},280,430),null);
  assert.equal(createMapFrame(map,0,430),null);
  for(const geometry of [map,{...map,imageWidthPixels:8000,imageHeightPixels:6000}])for(const zoom of [1,2,4,8]){
    const frame=createMapFrame(geometry,280,430),scale=metricScale(geometry,frame,zoom);
    near(scale.width*geometry.resolution/(frame.scale*zoom),scale.meters);
    assert.ok(scale.width>=40&&scale.width<=102);
  }
});

test('metric grid retains crossing segments, negative coordinates and rotated calibration',()=>{
  const frame={left:0,top:0,mapWidth:100,mapHeight:100};
  const line=clipGridLine({x:-50,y:50},{x:150,y:50},frame);
  near(line[0].x,0);near(line[1].x,100);
  assert.equal(clipGridLine({x:-50,y:-5},{x:150,y:-5},frame),null);
  for(const originYaw of [0,Math.PI/3]){
    const geometry={...map,originYaw},fit=createMapFrame(geometry,280,430),grid=mapGridLines(geometry,fit,2);
    assert.ok(grid.some(line=>line.label.includes('-')));
    for(const line of grid)for(const p of [line.a,line.b])assert.ok(p.x>=fit.left-1e-6&&p.x<=fit.left+fit.mapWidth+1e-6&&p.y>=fit.top-1e-6&&p.y<=fit.top+fit.mapHeight+1e-6);
  }
});
