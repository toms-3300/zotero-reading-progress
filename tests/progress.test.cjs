const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const sandbox = {};
const source = path.join(__dirname,'../src/progress.js');
if (fs.existsSync(source)) vm.runInNewContext(fs.readFileSync(source,'utf8'),sandbox);
const P = sandbox.ReadingProgress;
function item(tags=[], options={}) {
  return {
    libraryID:1, parentItemID:false, tags:tags.map(tag=>({tag,type:0})),
    isRegularItem:()=>true, isAttachment:()=>false,
    getTags(){ return this.tags.map(t=>({...t})); },
    setTags(tags){ this.tags=tags.map(t=>({...t})); },
    addTag(tag){ this.tags.push({tag,type:0}); },
    removeTag(tag){ this.tags=this.tags.filter(t=>t.tag!==tag); },
    async saveTx(){ if (this.fail) throw Error('write failed'); this.saved=true; },
    ...options
  };
}
test('untagged new papers display 未开始 without writing',()=>{
  assert.ok(P,'progress module must be implemented');
  const paper=item(); assert.equal(P.getStage(paper),0); assert.equal(paper.saved,undefined);
});
test('progress transitions keep exactly one status and preserve scientific tags',async()=>{
  const paper=item(['混沌','阅读进度/已初读']);
  await P.setStage(paper,3);
  assert.equal(P.getStage(paper),3);
  assert.deepEqual(paper.tags.map(t=>t.tag),['混沌','阅读进度/已复现']);
  await P.setStage(paper,1); assert.equal(P.getStage(paper),1);
  await P.setStage(paper,0); assert.equal(P.getStage(paper),0);
  assert.deepEqual(paper.tags.map(t=>t.tag),['混沌']);
});
test('highest completed stage wins when synced tags conflict',()=>{
  assert.equal(P.getStage(item(['阅读进度/已初读','阅读进度/已复现','阅读进度/已精读'])),3);
});
test('failed save restores all original tags and types',async()=>{
  const paper=item(['阅读进度/已精读','Hopfield'],{fail:true}); paper.tags[1].type=1;
  await assert.rejects(()=>P.setStage(paper,3),/write failed/);
  assert.equal(P.getStage(paper),2);
  assert.deepEqual(paper.tags,[{tag:'阅读进度/已精读',type:0},{tag:'Hopfield',type:1}]);
});
test('invalid stages cannot change tags',async()=>{
  const paper=item(['科学']);
  for (const bad of [-1,4,1.5,'2',null]) await assert.rejects(()=>P.setStage(paper,bad),/Invalid/);
  assert.deepEqual(paper.tags.map(t=>t.tag),['科学']);
});
test('child attachments and notes are ineligible; standalone PDF is eligible',()=>{
  assert.equal(P.isEligible(item([],{parentItemID:123,isRegularItem:()=>false,isAttachment:()=>true})),false);
  assert.equal(P.isEligible(item([],{isRegularItem:()=>false})),false);
  assert.equal(P.isEligible(item([],{isRegularItem:()=>false,isAttachment:()=>true})),true);
});
test('completed last for both native sort directions while native order stays intact',()=>{
  const rows=[{ref:item(['阅读进度/已复现']),level:0,n:'A'},{ref:item(),level:0,n:'B'},{ref:item(['阅读进度/已初读']),level:0,n:'D'},{ref:item(['阅读进度/已复现']),level:0,n:'C'}];
  assert.equal([...rows].sort((a,b)=>P.compareRows(a,b,()=>a.n.localeCompare(b.n))).map(r=>r.n).join(''),'BDAC');
  assert.equal([...rows].sort((a,b)=>P.compareRows(a,b,()=>b.n.localeCompare(a.n))).map(r=>r.n).join(''),'DBCA');
});
test('child rows and non-item headers defer to native comparator',()=>{
  const a={ref:item(['阅读进度/已复现']),level:1}, b={ref:item(),level:1};
  assert.equal(P.compareRows(a,b,()=>-7),-7);
  assert.equal(P.compareRows({ref:{}},{ref:item()},()=>8),8);
});
test('standalone notes cannot break the completed-last grouping',()=>{
  const completed={ref:item(['阅读进度/已复现']),level:0};
  const note={ref:item([],{isRegularItem:()=>false}),level:0};
  assert.equal(P.compareRows(completed,note,()=>-1),1);
});
