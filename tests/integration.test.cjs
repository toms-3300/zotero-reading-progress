const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function load() {
  const scope = {console, setTimeout, clearTimeout};
  for (const name of ['progress.js','bootstrap.js']) {
    const file=path.join(__dirname,'../src',name);
    if (fs.existsSync(file)) vm.runInNewContext(fs.readFileSync(file,'utf8'),scope);
  }
  return scope;
}
test('inactive integration does not alter native comparisons',()=>{
  const {ProgressPlugin}=load(); assert.ok(ProgressPlugin,'bootstrap integration missing');
  const tree={}; const win={ZoteroPane:{itemsView:tree}};
  const plugin=Object.create(ProgressPlugin); plugin.active=false;
  const proto={_compareRows(){return -9;}, _sort(ids){return ids;}};
  const undo=[]; plugin.patchSorting(win,proto,undo);
  assert.equal(proto._compareRows.call({itemTree:tree},{},{}),-9);
  undo.reverse().forEach(f=>f()); assert.equal(proto._compareRows(),-9);
});
test('main-tree partial sorts become full sorts; other trees remain untouched',()=>{
  const {ProgressPlugin}=load(); const tree={}; const other={};
  const plugin=Object.create(ProgressPlugin); plugin.active=true;
  const proto={_compareRows(){return 0;}, _sort(ids){return ids ?? 'FULL';}};
  const original=proto._sort; const undo=[];
  plugin.patchSorting({ZoteroPane:{itemsView:tree}},proto,undo);
  assert.equal(proto._sort.call({itemTree:tree},[123]),'FULL');
  assert.deepEqual(proto._sort.call({itemTree:other},[123]),[123]);
  undo.reverse().forEach(f=>f()); assert.equal(proto._sort,original);
});
test('completed grouping only affects the main tree and ignores native descending direction',()=>{
  const {ProgressPlugin}=load(); const plugin=Object.create(ProgressPlugin); plugin.active=true;
  const tree={}; const proto={_compareRows(){return -1;},_sort(){}};
  const paper=tags=>({parentItemID:false,isRegularItem:()=>true,getTags:()=>tags.map(tag=>({tag}))});
  plugin.patchSorting({ZoteroPane:{itemsView:tree}},proto,[]);
  const a={ref:paper(['阅读进度/已复现']),level:0},b={ref:paper([]),level:0};
  assert.equal(proto._compareRows.call({itemTree:tree},a,b),1);
  assert.equal(proto._compareRows.call({itemTree:{}},a,b),-1);
});
test('readonly library cannot receive a state update',async()=>{
  const scope=load(); const {ProgressPlugin}=scope;
  scope.Zotero={Libraries:{get:()=>({editable:false})}};
  const plugin=Object.create(ProgressPlugin);
  await assert.rejects(()=>plugin.setItems([{libraryID:3}],1),/只读/);
});
