import React, { ReactNode, ReactElement, ErrorInfo } from 'react';

/**
 * ================================================================================
 * FILE: ErrorBoundary.tsx - REACT ERROR BOUNDARY COMPONENT
 * ================================================================================
 * 
 * Catches React errors anywhere in the child component tree
 * Prevents entire app from crashing with graceful fallback UI
 * 
 * STRUCTURE:
 * 1.0 CLASS COMPONENT & LIFECYCLE METHODS
 * 2.0 ERROR HANDLING & LOGGING
 * 3.0 RESET HANDLER
 * 4.0 RENDER / UI
 * 
 * Usage: Wrap your app with <ErrorBoundary><App /></ErrorBoundary>
 * 
 * ================================================================================
 */

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

// ========== 1.0 CLASS COMPONENT & LIFECYCLE METHODS ==========
class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(_error: Error): State {
    return { hasError: true, error: _error, errorInfo: null };
  }

  // ========== 2.0 ERROR HANDLING & LOGGING ==========
  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({
      error,
      errorInfo,
    });
    
    // Log to console in development
    console.error('🚨 Application Error:', error);
    console.error('Error Info:', errorInfo);
    
    // TODO: Send to error tracking service (Sentry, LogRocket, etc.)
    // errorTrackingService.captureException(error, { extra: errorInfo });
  }

  // ========== 3.0 RESET HANDLER ==========
  handleRestart = (): void => {
    window.location.reload();
  };

  // ========== 4.0 RENDER / UI ==========
  render(): ReactElement {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            backgroundColor: '#000',
            color: '#fff',
            fontFamily: "'Outfit', sans-serif",
            padding: '2rem',
            gap: '2rem',
            textAlign: 'center',
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 'clamp(1.5rem, 5vw, 2.5rem)',
                marginBottom: '1rem',
                fontWeight: '700',
              }}
            >
              ⚠️ Oops! Something Went Wrong
            </h1>
            <p
              style={{
                color: '#888',
                marginBottom: '0.5rem',
                fontSize: '1rem',
                lineHeight: '1.6',
              }}
            >
              The app encountered an unexpected error.
            </p>
            <p
              style={{
                color: '#666',
                fontSize: '0.875rem',
                fontFamily: 'monospace',
                marginTop: '1rem',
                padding: '1rem',
                backgroundColor: '#111',
                borderRadius: '8px',
                maxWidth: '400px',
                wordBreak: 'break-word',
              }}
            >
              {this.state.error?.toString()}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <button
              onClick={this.handleRestart}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#6366f1',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '1rem',
                fontWeight: 'bold',
                transition: 'all 0.3s ease',
              }}
              onMouseEnter={(e) => {
                const target = e.target as HTMLButtonElement;
                target.style.backgroundColor = '#4f46e5';
                target.style.transform = 'scale(1.05)';
              }}
              onMouseLeave={(e) => {
                const target = e.target as HTMLButtonElement;
                target.style.backgroundColor = '#6366f1';
                target.style.transform = 'scale(1)';
              }}
            >
              🔄 Restart App
            </button>
            <button
              onClick={() => window.history.back()}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: 'transparent',
                color: '#fff',
                border: '1px solid #666',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '1rem',
                fontWeight: 'bold',
                transition: 'all 0.3s ease',
              }}
              onMouseEnter={(e) => {
                const target = e.target as HTMLButtonElement;
                target.style.borderColor = '#aaa';
                target.style.backgroundColor = '#111';
              }}
              onMouseLeave={(e) => {
                const target = e.target as HTMLButtonElement;
                target.style.borderColor = '#666';
                target.style.backgroundColor = 'transparent';
              }}
            >
              ← Go Back
            </button>
          </div>

          {import.meta.env.DEV && this.state.errorInfo && (
            <details
              style={{
                maxWidth: '600px',
                textAlign: 'left',
                backgroundColor: '#111',
                padding: '1rem',
                borderRadius: '8px',
                cursor: 'pointer',
              }}
            >
              <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>
                📋 Error Details (Dev Only)
              </summary>
              <pre
                style={{
                  marginTop: '1rem',
                  overflow: 'auto',
                  fontSize: '0.75rem',
                  color: '#0f0',
                }}
              >
                {this.state.errorInfo.componentStack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children as ReactElement;
  }
}

export default ErrorBoundary;
