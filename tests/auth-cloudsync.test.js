const { JSDOM } = require('jsdom');
const path = require('path');
const { loadHTML } = require('./load-html.cjs');

const ROOT = path.resolve(__dirname, '..');

function createTestDOM() {
  const html = loadHTML(path.join(ROOT, 'index.html'));
  const dom = new JSDOM(html, {
    url: 'http://localhost:8000',
    runScripts: 'dangerously',
    pretendToBeVisual: true
  });

  const w = dom.window;

  const store = {};
  w.localStorage = {
    data: store,
    getItem(key) { return store[key] || null; },
    setItem(key, val) { store[key] = val; },
    removeItem(key) { delete store[key]; },
    clear() { Object.keys(store).forEach(k => delete store[k]); }
  };

  w.alert = jest.fn();
  w.confirm = jest.fn(() => true);
  w.fetch = jest.fn(() => Promise.resolve({ ok: true, json: async () => ({}) }));
  w.matchMedia = jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn()
  }));

  if (!w.navigator.clipboard) {
    Object.defineProperty(w.navigator, 'clipboard', {
      value: { writeText: jest.fn().mockResolvedValue(undefined) },
      writable: true
    });
  }

  return dom;
}

describe('Auth + CloudSync Reliability', () => {
  let dom;
  let w;
  let doc;
  let Auth;
  let CloudSync;
  let FirebaseConfig;
  let firebaseAuth;
  let authStateCb;

  beforeEach(async () => {
    dom = createTestDOM();
    w = dom.window;
    doc = w.document;

    Auth = w.Auth;
    CloudSync = w.CloudSync || w.eval('typeof CloudSync !== "undefined" ? CloudSync : null');
    FirebaseConfig = w.FirebaseConfig || w.eval('typeof FirebaseConfig !== "undefined" ? FirebaseConfig : null');

    authStateCb = null;

    firebaseAuth = {
      onAuthStateChanged: jest.fn((cb) => { authStateCb = cb; }),
      signOut: jest.fn().mockResolvedValue(undefined),
      signInWithEmailAndPassword: jest.fn().mockResolvedValue({}),
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
      createUserWithEmailAndPassword: jest.fn().mockResolvedValue({
        user: {
          updateProfile: jest.fn().mockResolvedValue(undefined),
          sendEmailVerification: jest.fn().mockResolvedValue(undefined)
        }
      })
    };

    const firestoreDb = {
      enablePersistence: jest.fn().mockResolvedValue(undefined),
      collection: jest.fn(() => ({
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue({ exists: false, data: () => ({}) }),
          set: jest.fn().mockResolvedValue(undefined),
          update: jest.fn().mockResolvedValue(undefined),
          delete: jest.fn().mockResolvedValue(undefined),
          collection: jest.fn(() => ({
            doc: jest.fn(() => ({
              set: jest.fn().mockResolvedValue(undefined),
              get: jest.fn().mockResolvedValue({ exists: false, data: () => ({}) }),
              delete: jest.fn().mockResolvedValue(undefined)
            })),
            orderBy: jest.fn(() => ({ get: jest.fn().mockResolvedValue({ forEach: jest.fn() }) })),
            get: jest.fn().mockResolvedValue({ forEach: jest.fn() })
          }))
        }))
      })),
      batch: jest.fn(() => ({
        set: jest.fn(),
        delete: jest.fn(),
        commit: jest.fn().mockResolvedValue(undefined)
      }))
    };

    w.firebase = {
      initializeApp: jest.fn(() => ({ name: 'mock-app' })),
      auth: jest.fn(() => firebaseAuth),
      firestore: jest.fn(() => firestoreDb)
    };
    w.firebase.firestore.FieldValue = {
      serverTimestamp: jest.fn(() => ({ __mockTs: true }))
    };

    w.Paywall = { loadSubscription: jest.fn().mockResolvedValue(undefined) };
    w.App = w.App || {};
    w.App.toast = jest.fn();
    w.App.updateLandingGreeting = jest.fn();
    w.App.loadDarkMode = jest.fn();

    await FirebaseConfig.init();
    w.fetch.mockClear();
  });

  afterEach(() => {
    dom.window.close();
  });

  test('auth module exposes core API used by login and sync gate', () => {
    expect(Auth).toBeDefined();
    expect(typeof Auth.init).toBe('function');
    expect(typeof Auth.login).toBe('function');
    expect(typeof Auth.logout).toBe('function');
    expect(typeof Auth.showModal).toBe('function');
    expect(typeof Auth.apiFetch).toBe('function');
    expect(typeof CloudSync.schedulePush).toBe('function');
    expect(typeof CloudSync.fullSync).toBe('function');
  });

  test('Auth.init registers auth state listener', async () => {
    await Auth.init();
    expect(firebaseAuth.onAuthStateChanged).toHaveBeenCalledTimes(1);
    expect(typeof authStateCb).toBe('function');
  });

  test('signed-in state triggers cloud pull and subscription load', async () => {
    await Auth.init();

    const pullSpy = jest.spyOn(CloudSync, 'pullFromCloud').mockResolvedValue(undefined);
    authStateCb({
      uid: 'u_1',
      email: 'agent@example.com',
      displayName: 'Agent One',
      getIdToken: jest.fn().mockResolvedValue('tok_1')
    });

    await Promise.resolve();

    expect(pullSpy).toHaveBeenCalledTimes(1);
    expect(w.Paywall.loadSubscription).toHaveBeenCalledTimes(1);
    expect(Auth.isSignedIn).toBe(true);

    pullSpy.mockRestore();
  });

  test('Auth.apiFetch injects bearer token after sign-in', async () => {
    await Auth.init();
    const pullSpy = jest.spyOn(CloudSync, 'pullFromCloud').mockResolvedValue(undefined);
    authStateCb({
      uid: 'u_2',
      email: 'agent2@example.com',
      displayName: 'Agent Two',
      getIdToken: jest.fn().mockResolvedValue('token-123')
    });

    await Auth.apiFetch('/api/kv-store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    const [, options] = w.fetch.mock.calls[0];
    expect(options.headers.Authorization).toBe('Bearer token-123');
    expect(options.headers['Content-Type']).toBe('application/json');
    pullSpy.mockRestore();
  });

  test('showModal opens login view when signed out', () => {
    Auth.showModal();
    const loginView = doc.querySelector('[data-auth-view="login"]');
    const accountView = doc.querySelector('[data-auth-view="account"]');

    expect(loginView.style.display).toBe('block');
    expect(accountView.style.display).toBe('none');
  });

  test('CloudSync.schedulePush debounces repeated writes to one push', async () => {
    jest.useFakeTimers();

    await Auth.init();
    const pullSpy = jest.spyOn(CloudSync, 'pullFromCloud').mockResolvedValue(undefined);
    authStateCb({
      uid: 'u_sync',
      email: 'sync@example.com',
      displayName: 'Sync Agent',
      getIdToken: jest.fn().mockResolvedValue('tok')
    });

    const pushSpy = jest.spyOn(CloudSync, 'pushToCloud').mockResolvedValue(undefined);

    CloudSync.schedulePush();
    CloudSync.schedulePush();
    CloudSync.schedulePush();

    jest.advanceTimersByTime(2999);
    expect(pushSpy).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    await Promise.resolve();
    expect(pushSpy).toHaveBeenCalledTimes(1);

    pushSpy.mockRestore();
    pullSpy.mockRestore();
    jest.useRealTimers();
  });

  test('CloudSync.fullSync emits signed-out guidance when user not signed in', async () => {
    await Auth.init();
    authStateCb(null);

    const events = [];
    CloudSync.onSync((evt) => events.push(evt));

    await CloudSync.fullSync();

    expect(events.some(evt => evt.message.includes('Sign in to sync across devices'))).toBe(true);
  });

  test('CloudSync.getStatus returns signed-out state when no auth user', async () => {
    await Auth.init();
    authStateCb(null);

    const status = CloudSync.getStatus();
    expect(status.status).toBe('signed-out');
    expect(status.label).toContain('Sign in');
  });
});
