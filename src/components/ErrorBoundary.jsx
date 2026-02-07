import React from 'react';

/**
 * ErrorBoundary Component
 * Catches React errors anywhere in the child component tree
 * Prevents entire app from crashing
 * 
 * Usage: Wrap your app with <ErrorBoundary><App /></ErrorBoundary>
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(_error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
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

  handleRestart = () => {
    window.location.reload();
  };

  render() {
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
                e.target.style.backgroundColor = '#4f46e5';
                e.target.style.transform = 'scale(1.05)';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = '#6366f1';
                e.target.style.transform = 'scale(1)';
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
                e.target.style.borderColor = '#aaa';
                e.target.style.backgroundColor = '#111';
              }}
              onMouseLeave={(e) => {
                e.target.style.borderColor = '#666';
                e.target.style.backgroundColor = 'transparent';
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

    return this.props.children;
  }
}

export default ErrorBoundary;
