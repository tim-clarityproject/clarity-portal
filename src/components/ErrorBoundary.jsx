import { Component } from 'react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  handleBack = () => {
    this.setState({ hasError: false, error: null });
    window.history.back();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fafafa', padding: '20px' }}>
          <div style={{ maxWidth: '500px', textAlign: 'center' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#333', marginBottom: '12px' }}>
              Something went wrong
            </h1>
            <p style={{ fontSize: '14px', color: '#666', marginBottom: '24px', lineHeight: '1.5' }}>
              An error occurred while loading this page. Please try going back.
            </p>
            <details style={{ marginBottom: '24px', textAlign: 'left', padding: '12px', backgroundColor: '#f5f5f5', borderRadius: '6px', fontSize: '12px', color: '#666' }}>
              <summary style={{ cursor: 'pointer', fontWeight: '600', marginBottom: '8px' }}>
                Error details
              </summary>
              <pre style={{ overflow: 'auto', marginTop: '8px', padding: '8px', backgroundColor: '#fff', borderRadius: '4px', fontSize: '11px', color: '#c62828' }}>
                {this.state.error?.toString()}
              </pre>
            </details>
            <button
              onClick={this.handleBack}
              style={{
                padding: '12px 24px',
                backgroundColor: '#F08571',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#e6745f'}
              onMouseLeave={(e) => e.target.style.backgroundColor = '#F08571'}
            >
              Go Back
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
