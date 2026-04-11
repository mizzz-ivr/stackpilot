import { BrowserView, BrowserWindow, session } from 'electron';
import type { Workspace } from '../../../shared/contracts';
import { ApiLogService } from './apiLogService';

type ActiveTab = { view: BrowserView; workspaceId: string; tabId: string };

export class BrowserViewManager {
  private activeTab?: ActiveTab;
  private views = new Map<string, BrowserView>();

  constructor(private readonly apiLogService: ApiLogService) {}

  openTab(window: BrowserWindow, workspace: Workspace, tabId: string, url: string): BrowserView {
    const key = `${workspace.id}:${tabId}`;
    const existing = this.views.get(key);
    if (existing) {
      window.setBrowserView(existing);
      existing.webContents.loadURL(url);
      this.resize(window, existing);
      this.activeTab = { view: existing, workspaceId: workspace.id, tabId };
      return existing;
    }

    const view = new BrowserView({
      webPreferences: {
        partition: workspace.partition,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });

    const targetSession = session.fromPartition(workspace.partition);
    this.apiLogService.attachSession(targetSession, workspace.id, (webContentsId) => {
      const hit = [...this.views.entries()].find(([, v]) => v.webContents.id === webContentsId);
      return hit?.[0].split(':')[1];
    });

    this.views.set(key, view);
    window.setBrowserView(view);
    view.webContents.loadURL(url);
    this.resize(window, view);
    this.activeTab = { view, workspaceId: workspace.id, tabId };
    return view;
  }

  openDevTools(): void {
    this.activeTab?.view.webContents.openDevTools({ mode: 'detach' });
  }

  resize(window: BrowserWindow, view?: BrowserView): void {
    const target = view ?? this.activeTab?.view;
    if (!target) return;
    const bounds = window.getContentBounds();
    target.setBounds({ x: 320, y: 92, width: bounds.width - 320, height: bounds.height - 92 });
    target.setAutoResize({ width: true, height: true });
  }

  currentWebContentsId(): number | undefined {
    return this.activeTab?.view.webContents.id;
  }
}
