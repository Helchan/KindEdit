import React from 'react';

interface AppErrorBoundaryProps {
  children: React.ReactNode;
}

interface AppErrorBoundaryState {
  errorMessage: string | null;
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}${error.stack ? `\n${error.stack}` : ''}`;
  }
  return String(error);
}

export default class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { errorMessage: null };

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return { errorMessage: formatError(error) };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('[KindEdit] React error boundary', error, info.componentStack);
  }

  render() {
    if (!this.state.errorMessage) {
      return this.props.children;
    }

    return (
      <div className="app-error-boundary">
        <div className="app-error-panel">
          <div className="app-error-title">KindEdit 界面发生错误</div>
          <div className="app-error-description">
            当前视图已停止渲染。错误信息已保留在下方，请记录触发步骤后重启应用。
          </div>
          <pre className="app-error-details">{this.state.errorMessage}</pre>
        </div>
      </div>
    );
  }
}
