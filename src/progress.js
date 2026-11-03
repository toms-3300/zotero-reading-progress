/* Reading state is stored in ordinary Zotero tags. No tag means 未开始. */
var ReadingProgress = {
  labels: ['未开始', '已初读', '已精读', '已复现'],
  tags: [null, '阅读进度/已初读', '阅读进度/已精读', '阅读进度/已复现'],

  isEligible(item) {
    return Boolean(item && !item.parentItemID &&
      (item.isRegularItem?.() || item.isAttachment?.()));
  },

  getStage(item) {
    if (!item?.getTags) return 0;
    const tags = new Set(item.getTags().map(t => t.tag));
    for (let stage = 3; stage > 0; stage--) {
      if (tags.has(this.tags[stage])) return stage;
    }
    return 0;
  },

  async setStage(item, stage) {
    if (!Number.isInteger(stage) || stage < 0 || stage > 3) {
      throw new Error('Invalid reading stage');
    }
    if (!this.isEligible(item)) throw new Error('This row is not a top-level paper');
    const previous = item.getTags();
    try {
      for (const tag of this.tags.slice(1)) item.removeTag(tag);
      if (stage) item.addTag(this.tags[stage], 0);
      await item.saveTx();
    }
    catch (error) {
      item.setTags(previous);
      throw error;
    }
  },

  compareRows(a, b, nativeCompare) {
    if (a.level === 0 && b.level === 0 && a.ref?.getTags && b.ref?.getTags) {
      const group = Number(this.isEligible(a.ref) && this.getStage(a.ref) === 3) -
        Number(this.isEligible(b.ref) && this.getStage(b.ref) === 3);
      if (group) return group;
    }
    return nativeCompare();
  }
};
