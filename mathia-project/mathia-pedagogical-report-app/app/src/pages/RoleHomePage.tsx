import { Navigate } from "@solidjs/router";
import { Match, Switch, type Component } from "solid-js";

import { defaultRouteForRole } from "../lib/roles";
import { useAuth } from "../stores/auth";
import { LoadingPage } from "./LoadingPage";

export const RoleHomePage: Component = () => {
  const auth = useAuth();
  const destination = (): string => {
    const user = auth.user;
    return user ? defaultRouteForRole(user.role) : "/login";
  };

  return (
    <Switch>
      <Match when={auth.status === "loading"}>
        <LoadingPage />
      </Match>
      <Match when={auth.status !== "loading"}>
        <Navigate href={destination()} />
      </Match>
    </Switch>
  );
};
