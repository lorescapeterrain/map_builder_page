/* eslint-disable no-console */

const ENABLED_STORAGE_KEY = 'lorescape:debug:enabled';
const NAMESPACE_STORAGE_KEY = 'lorescape:debug:namespaces';

const state = {
  enabled: false,
  namespaces: new Set(),
  listeners: new Set()
};

function toArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  const parts = String(value)
    .split(/[\s,]+/u)
    .map(part => part.trim())
    .filter(Boolean);
  return parts;
}

function persistEnabled(enabled) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(ENABLED_STORAGE_KEY, enabled ? '1' : '0');
    }
  } catch (error) {
    console.warn('debugLogger: failed to persist enabled state', error);
  }
}

function persistNamespaces(namespaces) {
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = namespaces.size ? [...namespaces].join(',') : '';
      localStorage.setItem(NAMESPACE_STORAGE_KEY, stored);
    }
  } catch (error) {
    console.warn('debugLogger: failed to persist namespaces', error);
  }
}

function notifyListeners() {
  state.listeners.forEach(listener => {
    try {
      listener({
        enabled: state.enabled,
        namespaces: new Set(state.namespaces)
      });
    } catch (error) {
      console.warn('debugLogger: listener callback error', error);
    }
  });
}

function shouldLog(namespace) {
  if (!state.enabled) return false;
  if (!state.namespaces.size) return true;
  return namespace && state.namespaces.has(namespace);
}

function createLogger(namespace) {
  const ns = namespace || 'app';
  const prefix = `[${ns}]`;

  const api = {
    log: (...args) => {
      if (shouldLog(ns)) {
        console.log(prefix, ...args);
      }
    },
    group: (...args) => {
      if (shouldLog(ns)) {
        console.group(prefix, ...args);
      }
    },
    groupCollapsed: (...args) => {
      if (shouldLog(ns)) {
        console.groupCollapsed(prefix, ...args);
      }
    },
    groupEnd: () => {
      if (shouldLog(ns)) {
        console.groupEnd();
      }
    },
    table: (...args) => {
      if (shouldLog(ns)) {
        console.table(...args);
      }
    },
    time: (label) => {
      if (shouldLog(ns)) {
        console.time(`${prefix} ${label ?? ''}`.trim());
      }
    },
    timeEnd: (label) => {
      if (shouldLog(ns)) {
        console.timeEnd(`${prefix} ${label ?? ''}`.trim());
      }
    },
    isEnabled: () => shouldLog(ns),
    child: (suffix) => createLogger(`${ns}:${suffix}`)
  };

  return api;
}

export function setDebugEnabled(enabled, { persist = true } = {}) {
  const next = Boolean(enabled);
  if (state.enabled === next) return state.enabled;
  state.enabled = next;
  if (persist) persistEnabled(state.enabled);
  notifyListeners();
  return state.enabled;
}

export function setDebugNamespaces(namespaces, { persist = true } = {}) {
  const next = new Set(toArray(namespaces));
  const sameSize = next.size === state.namespaces.size;
  const sameMembers = sameSize && [...next].every(ns => state.namespaces.has(ns));
  if (sameMembers) return new Set(state.namespaces);
  state.namespaces = next;
  if (persist) persistNamespaces(state.namespaces);
  notifyListeners();
  return new Set(state.namespaces);
}

export function clearDebugNamespaces(options) {
  return setDebugNamespaces([], options);
}

export function onDebugStateChange(listener) {
  if (typeof listener !== 'function') return () => {};
  state.listeners.add(listener);
  return () => state.listeners.delete(listener);
}

export function createDebugLogger(namespace) {
  return createLogger(namespace);
}

export function isDebugEnabled(namespace) {
  if (namespace) {
    return shouldLog(namespace);
  }
  return state.enabled;
}

function hydrateFromStorage() {
  try {
    if (typeof localStorage !== 'undefined') {
      const enabledRaw = localStorage.getItem(ENABLED_STORAGE_KEY);
      if (enabledRaw === '1') {
        state.enabled = true;
      }
      const namespacesRaw = localStorage.getItem(NAMESPACE_STORAGE_KEY);
      if (namespacesRaw) {
        state.namespaces = new Set(toArray(namespacesRaw));
      }
    }
  } catch (error) {
    console.warn('debugLogger: failed to hydrate from storage', error);
  }
}

function hydrateFromLocation() {
  if (typeof location === 'undefined') return;
  try {
    const params = new URLSearchParams(location.search);
    if (params.has('debug')) {
      const value = params.get('debug');
      const normalized = (value ?? '').toLowerCase();
      if (!value || normalized === '1' || normalized === 'true' || normalized === 'on') {
        setDebugEnabled(true, { persist: false });
      } else if (normalized === '0' || normalized === 'false' || normalized === 'off') {
        setDebugEnabled(false, { persist: false });
      } else {
        setDebugEnabled(true, { persist: false });
        setDebugNamespaces(value, { persist: false });
      }
    }
    if (params.has('debugNamespaces')) {
      setDebugNamespaces(params.get('debugNamespaces'), { persist: false });
    }
  } catch (error) {
    console.warn('debugLogger: failed to hydrate from location', error);
  }
}

hydrateFromStorage();
hydrateFromLocation();

if (typeof window !== 'undefined') {
  const api = {
    enable: () => setDebugEnabled(true),
    disable: () => setDebugEnabled(false),
    toggle: () => setDebugEnabled(!state.enabled),
    setNamespaces: (namespaces) => setDebugNamespaces(namespaces),
    clearNamespaces: () => clearDebugNamespaces(),
    getState: () => ({
      enabled: state.enabled,
      namespaces: [...state.namespaces]
    }),
    isEnabled: (namespace) => isDebugEnabled(namespace),
    onChange: onDebugStateChange
  };
  try {
    Object.defineProperty(window, 'lorescapeDebug', {
      value: api,
      configurable: false,
      enumerable: false,
      writable: false
    });
  } catch (error) {
    console.warn('debugLogger: failed to attach window.lorescapeDebug', error);
  }
}

export default createDebugLogger;
