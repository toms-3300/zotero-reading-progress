/* Zotero 10.0.x integration. Adapted to installed ItemTree/RowProvider contracts. */
var ProgressPlugin = {
  active: false,
  windows: new Map(),
  queue: Promise.resolve(),
  observerID: null,
  refreshTimer: null,

  patch(object, key, createWrapper, undo) {
    const original = object[key];
    if (typeof original !== 'function') throw new Error('Zotero interface missing: ' + key);
    const wrapped = createWrapper(original);
    object[key] = wrapped;
    undo.push(() => { if (object[key] === wrapped) object[key] = original; });
  },

  patchSorting(win, prototype, undo) {
    const plugin = this;
    this.patch(prototype, '_compareRows', original => function(a, b) {
      const nativeCompare = () => original.call(this, a, b);
      if (!plugin.active || this.itemTree !== win.ZoteroPane?.itemsView) return nativeCompare();
      return ReadingProgress.compareRows(a, b, nativeCompare);
    }, undo);
    this.patch(prototype, '_sort', original => function(ids) {
      return original.call(this, plugin.active && this.itemTree === win.ZoteroPane?.itemsView ? undefined : ids);
    }, undo);
  },

  async start(rootURI) {
    this.rootURI = rootURI;
    this.active = true;
    this.observerID = Zotero.Notifier.registerObserver({
      notify: () => this.scheduleRefresh()
    }, ['item', 'item-tag'], 'reading-progress');
    for (const win of Zotero.getMainWindows()) await this.addWindow(win);
  },

  async addWindow(win) {
    if (!this.active || this.windows.has(win)) return;
    const state = { undo: [], nodes: [], win };
    this.windows.set(win, state);
    try {
      const ItemTree = win.require('zotero/itemTree');
      this.patchSorting(win, ItemTree.ItemTreeRowProvider.prototype, state.undo);
      const plugin = this;
      this.patch(ItemTree.prototype, '_renderCell', original => function(index, data, column, first) {
        const cell = original.call(this, index, data, column, first);
        if (plugin.active && this === win.ZoteroPane?.itemsView && column.dataKey === 'title') {
          const item = this.getRow(index)?.ref;
          if (ReadingProgress.isEligible(item)) plugin.decorate(cell, item, win);
        }
        return cell;
      }, state.undo);
      const style = win.document.createElementNS('http://www.w3.org/1999/xhtml','link');
      style.rel = 'stylesheet'; style.href = this.rootURI + 'style.css';
      style.id = 'reading-progress-stylesheet';
      win.document.documentElement.append(style); state.nodes.push(style);
      this.addMenu(win, state);
      this.scheduleRefresh();
    }
    catch (error) {
      this.removeWindow(win);
      Zotero.logError(error);
      Services.prompt.alert(win, '阅读进度插件', '界面适配失败：' + error.message);
    }
  },

  decorate(cell, item, win) {
    cell.classList.add('rp-title-cell');
    const select = win.document.createElementNS('http://www.w3.org/1999/xhtml','select');
    select.className = 'rp-stage';
    select.dataset.rpItem = String(item.id);
    select.setAttribute('aria-label', '阅读进度：' + item.getField('title'));
    select.title = '选择阅读进度';
    ReadingProgress.labels.forEach((label, index) => {
      const option = win.document.createElementNS('http://www.w3.org/1999/xhtml','option');
      option.value = String(index); option.textContent = label; select.append(option);
    });
    const stage = ReadingProgress.getStage(item);
    select.value = String(stage); select.dataset.stage = String(stage);
    select.disabled = !Zotero.Libraries.get(item.libraryID)?.editable || Boolean(item.deleted);
    for (const type of ['mousedown','mouseup','click','dblclick','keydown','keypress','keyup']) {
      select.addEventListener(type, event => event.stopPropagation());
    }
    select.addEventListener('change', () => {
      const next = Number(select.value);
      select.disabled = true;
      this.enqueue(() => this.setItems([item], next)).catch(error => {
        if (!win.closed) Services.prompt.alert(win, '阅读进度未保存', error.message);
      }).finally(() => {
        select.value = String(ReadingProgress.getStage(item));
        select.dataset.stage = select.value;
        select.disabled = !Zotero.Libraries.get(item.libraryID)?.editable || Boolean(item.deleted);
        this.scheduleRefresh();
      });
    });
    cell.append(select);
  },

  enqueue(operation) {
    const pending = this.queue.then(operation);
    this.queue = pending.catch(() => {});
    return pending;
  },

  async setItems(items, stage) {
    if (items.some(item => !Zotero.Libraries.get(item.libraryID)?.editable || item.deleted)) {
      throw new Error('所选文献只读或在回收站中，不能修改进度。');
    }
    // Persist one at a time; failures are reported, rather than silently ignored.
    for (const item of items) await ReadingProgress.setStage(item, stage);
    this.scheduleRefresh();
  },

  addMenu(win, state) {
    const doc = win.document;
    const parent = doc.getElementById('zotero-itemmenu');
    if (!parent) return;
    const menu = doc.createXULElement('menu'); menu.id = 'reading-progress-menu';
    menu.setAttribute('label','设置阅读进度');
    const popup = doc.createXULElement('menupopup'); menu.append(popup);
    const options = ReadingProgress.labels.map((label, stage) => {
      const entry = doc.createXULElement('menuitem');
      entry.setAttribute('label',label); entry.setAttribute('type','radio');
      entry.setAttribute('name','reading-progress-state');
      entry.addEventListener('command', () => {
        const items = win.ZoteroPane.getSelectedItems().filter(item => ReadingProgress.isEligible(item));
        this.enqueue(() => this.setItems(items, stage)).catch(error =>
          Services.prompt.alert(win, '阅读进度未保存', error.message));
      });
      popup.append(entry); return entry;
    });
    const onPopup = event => {
      if (event.target !== parent) return;
      const items = win.ZoteroPane.getSelectedItems().filter(item => ReadingProgress.isEligible(item));
      menu.hidden = !items.length;
      menu.disabled = items.some(item => !Zotero.Libraries.get(item.libraryID)?.editable || item.deleted);
      options.forEach((entry, stage) => entry.setAttribute('checked',
        String(items.length > 0 && items.every(item => ReadingProgress.getStage(item) === stage))));
    };
    parent.addEventListener('popupshowing',onPopup);
    state.undo.push(() => parent.removeEventListener('popupshowing',onPopup));
    parent.append(menu); state.nodes.push(menu);
  },

  scheduleRefresh() {
    if (!this.active || this.refreshTimer !== null) return;
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      this.refresh().catch(error => Zotero.logError(error));
    }, 80);
  },

  async refresh() {
    for (const win of this.windows.keys()) {
      if (!this.active || win.closed) continue;
      const tree = win.ZoteroPane?.itemsView;
      if (tree?.sort) {
        await tree.waitForLoad();
        if (!this.active || win.closed || !tree._getColumns().some(column => !column.hidden)) continue;
        await tree.sort();
        tree.tree?.invalidate();
      }
    }
  },

  removeWindow(win, restoreOrder = true) {
    const state = this.windows.get(win);
    if (!state) return;
    for (const undo of state.undo.reverse()) undo();
    for (const node of state.nodes) node.remove();
    this.windows.delete(win);
    // Remove live controls immediately, including while plugin is disabled.
    for (const control of win.document.querySelectorAll('.rp-stage')) control.remove();
    for (const cell of win.document.querySelectorAll('.rp-title-cell')) cell.classList.remove('rp-title-cell');
    if (restoreOrder && !win.closed && win.ZoteroPane?.itemsView) {
      win.ZoteroPane.itemsView.sort().catch(error => Zotero.logError(error));
      win.ZoteroPane.itemsView.tree?.invalidate();
    }
  },

  async stop(restoreOrder = true) {
    this.active = false;
    if (this.refreshTimer !== null) clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
    if (this.observerID !== null) Zotero.Notifier.unregisterObserver(this.observerID);
    this.observerID = null;
    await this.queue;
    for (const win of [...this.windows.keys()]) this.removeWindow(win, restoreOrder);
  }
};

async function startup({rootURI}) {
  const scope = {};
  Services.scriptloader.loadSubScript(rootURI + 'progress.js', scope);
  // Keep status logic scoped to this plugin, away from Zotero's global object.
  ReadingProgress = scope.ReadingProgress;
  await ProgressPlugin.start(rootURI);
}
var ReadingProgress;
async function shutdown(data, reason) { await ProgressPlugin.stop(reason !== APP_SHUTDOWN); }
function install() {}
function uninstall() {}
async function onMainWindowLoad({window}) { await ProgressPlugin.addWindow(window); }
function onMainWindowUnload({window}) { ProgressPlugin.removeWindow(window, false); }
