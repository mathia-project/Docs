import { Match, Switch, type ParentComponent } from "solid-js";
import { Navigate } from "@solidjs/router";

import { canAccess, type AppRole } from "../../lib/roles";
import { useAuth } from "../../stores/auth";
import { LoadingPage } from "../../pages/LoadingPage";

interface AuthGateProps {
  allowedRoles: readonly AppRole[];
}

export const AuthGate: ParentComponent<AuthGateProps> = (props) => {
  const auth = useAuth();
  const hasAccess = (): boolean => {
    const user = auth.user;
    return user !== null && canAccess(user.role, props.allowedRoles);
  };

  return (
    <Switch fallback={<Navigate href="/forbidden" />}>
      <Match when={auth.status === "loading"}>
        <LoadingPage />
      </Match>
      <Match when={auth.status === "anonymous"}>
        <Navigate href="/login" />
      </Match>
      <Match when={hasAccess()}>{props.children}</Match>
    </Switch>
  );
};
