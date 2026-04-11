import { describe, expect, it } from 'vitest';
import { alignWorkspaceTabs, resolveWorkspaceActiveTabId, toWorkspaceContextRule } from '../../shared/domain/workspace';

describe('workspace domain rules', () => {
  it('activeTabId が不正でも先頭タブを active に正規化する', () => {
    const tabs = alignWorkspaceTabs(
      {
        tabs: [
          { id: 't1', title: 'Tab1', url: 'https://a.test', isActive: false },
          { id: 't2', title: 'Tab2', url: 'https://b.test', isActive: false }
        ]
      },
      'not-found'
    );

    expect(tabs[0].isActive).toBe(true);
    expect(resolveWorkspaceActiveTabId({ tabs })).toBe('t1');
  });

  it('prod workspace は danger warning になる', () => {
    const rule = toWorkspaceContextRule({ environmentType: 'prod' });
    expect(rule.warningLevel).toBe('danger');
    expect(rule.showDangerOutline).toBe(true);
  });
});
