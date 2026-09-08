import React, { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

const TOAST_DURATION = 2600;

/** 状态对应的简图标：成功勾、错误叉、信息点。 */
function ToastIcon({ type }) {
  if (type === 'success') {
    return (
      <svg className="toast-icon" viewBox="0 0 16 16" aria-hidden="true">
        <path
          fill="currentColor"
          d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm3.1 5.2-3.4 3.5a.7.7 0 0 1-1 0L4.9 8a.75.75 0 1 1 1-1.1l1.3 1.2 2.9-3a.75.75 0 1 1 1.1 1.1Z"
        />
      </svg>
    );
  }
  if (type === 'error') {
    return (
      <svg className="toast-icon" viewBox="0 0 16 16" aria-hidden="true">
        <path
          fill="currentColor"
          d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm2.4 4.1a.75.75 0 0 1 0 1.1L9.1 8l1.3 1.3a.75.75 0 1 1-1.1 1.1L8 9.1l-1.3 1.3a.75.75 0 0 1-1.1-1.1L6.9 8 5.6 6.7a.75.75 0 0 1 1.1-1.1L8 6.9l1.3-1.3a.75.75 0 0 1 1.1 0Z"
        />
      </svg>
    );
  }
  return (
    <svg className="toast-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm0 3.2a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8ZM7.25 7.5h1.5v4.25h-1.5V7.5Z"
      />
    </svg>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showMessage = useCallback((text, type = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-2), { id, text, type }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, TOAST_DURATION);
  }, []);

  return (
    <ToastContext.Provider value={showMessage}>
      {children}
      <div className="toast-container" aria-live="polite" aria-relevant="additions">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`} role="status">
            <ToastIcon type={t.type} />
            <span className="toast-text">{t.text}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
