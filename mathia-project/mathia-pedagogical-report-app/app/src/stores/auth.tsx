import {
  createContext,
  onMount,
  useContext,
  type ParentComponent,
} from "solid-js";
import { createStore } from "solid-js/store";

import {
  authService,
  AuthServiceError,
  type AuthCredentials,
  type AuthErrorCode,
  type AuthUser,
} from "../services/auth";

export type AuthStatus = "loading" | "anonymous" | "authenticated";

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  error: AuthErrorCode | null;
  isSubmitting: boolean;
}

interface AuthContextValue {
  readonly status: AuthStatus;
  readonly user: AuthUser | null;
  readonly error: AuthErrorCode | null;
  readonly isSubmitting: boolean;
  signIn: (credentials: AuthCredentials) => Promise<AuthUser>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue>();

function authErrorCode(error: unknown): AuthErrorCode {
  return error instanceof AuthServiceError ? error.code : "unavailable";
}

export const AuthProvider: ParentComponent = (props) => {
  const [state, setState] = createStore<AuthState>({
    status: "loading",
    user: null,
    error: null,
    isSubmitting: false,
  });

  const refresh = async (): Promise<void> => {
    setState({ status: "loading", error: null });

    try {
      const user = await authService.getCurrentUser();
      setState({ status: "authenticated", user });
    } catch (error) {
      setState({
        status: "anonymous",
        user: null,
        error: error instanceof AuthServiceError && error.code === "unsupportedRole" ? error.code : null,
      });
    }
  };

  const signIn = async (credentials: AuthCredentials): Promise<AuthUser> => {
    setState({ isSubmitting: true, error: null });

    try {
      const user = await authService.signIn(credentials);
      setState({ status: "authenticated", user });
      return user;
    } catch (error) {
      setState({ status: "anonymous", user: null, error: authErrorCode(error) });
      throw error;
    } finally {
      setState("isSubmitting", false);
    }
  };

  const signOut = async (): Promise<void> => {
    try {
      await authService.signOut();
    } finally {
      setState({ status: "anonymous", user: null, error: null });
    }
  };

  const value: AuthContextValue = {
    get status() {
      return state.status;
    },
    get user() {
      return state.user;
    },
    get error() {
      return state.error;
    },
    get isSubmitting() {
      return state.isSubmitting;
    },
    signIn,
    signOut,
    refresh,
    clearError: () => setState("error", null),
  };

  onMount(() => {
    void refresh();
  });

  return <AuthContext.Provider value={value}>{props.children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
