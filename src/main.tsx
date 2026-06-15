import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AppErrorBoundary from './components/AppErrorBoundary';
import './styles/variables.css';
import './styles/global.css';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatGlobalError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}${error.stack ? `\n${error.stack}` : ''}`;
  }
  return String(error);
}

function showFatalFrontendError(title: string, error: unknown) {
  const root = document.getElementById('root');
  if (!root) return;
  const message = escapeHtml(formatGlobalError(error));
  root.innerHTML = `
    <div class="app-error-boundary">
      <div class="app-error-panel">
        <div class="app-error-title">${escapeHtml(title)}</div>
        <div class="app-error-description">当前视图已停止渲染。错误信息已保留在下方，请记录触发步骤后重启应用。</div>
        <pre class="app-error-details">${message}</pre>
      </div>
    </div>
  `;
}

window.addEventListener('error', (event) => {
  console.error('[KindEdit] Unhandled frontend error', event.error || event.message);
  showFatalFrontendError('KindEdit 界面发生错误', event.error || event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[KindEdit] Unhandled promise rejection', event.reason);
  showFatalFrontendError('KindEdit 异步任务发生错误', event.reason);
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);
