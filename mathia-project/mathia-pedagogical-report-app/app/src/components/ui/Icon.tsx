import { Match, Switch, type Component } from "solid-js";

export type IconName =
  | "archive"
  | "arrow-left"
  | "arrow-right"
  | "backpack"
  | "book"
  | "check"
  | "chevron-right"
  | "class"
  | "dashboard"
  | "filter"
  | "link"
  | "lock"
  | "menu"
  | "pencil"
  | "plus"
  | "refresh"
  | "report"
  | "school"
  | "search"
  | "students"
  | "trash"
  | "upload"
  | "user"
  | "x";

interface IconProps {
  name: IconName;
  class?: string;
}

export const Icon: Component<IconProps> = (props) => (
  <svg
    aria-hidden="true"
    class={props.class ?? "size-5"}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <Switch>
      <Match when={props.name === "archive"}>
        <path d="M21 8v13H3V8" />
        <path d="M1 3h22v5H1z" />
        <path d="M10 12h4" />
      </Match>
      <Match when={props.name === "arrow-left"}>
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </Match>
      <Match when={props.name === "arrow-right"}>
        <path d="M5 12h14M13 6l6 6-6 6" />
      </Match>
      <Match when={props.name === "backpack"}>
        <rect x="5" y="8" width="14" height="13" rx="3" />
        <path d="M9 8V5a3 3 0 0 1 6 0v3" />
        <path d="M9 13h6" />
        <path d="M12 11v4" />
      </Match>
      <Match when={props.name === "book"}>
        <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z" />
        <path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5v-16Z" />
      </Match>
      <Match when={props.name === "check"}>
        <path d="m5 12 4 4L19 6" />
      </Match>
      <Match when={props.name === "chevron-right"}>
        <path d="m9 18 6-6-6-6" />
      </Match>
      <Match when={props.name === "class"}>
        <path d="M4 5h16v12H4z" />
        <path d="M8 21h8M12 17v4M8 9h8M8 13h5" />
      </Match>
      <Match when={props.name === "dashboard"}>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </Match>
      <Match when={props.name === "filter"}>
        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
      </Match>
      <Match when={props.name === "link"}>
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </Match>
      <Match when={props.name === "lock"}>
        <rect x="4" y="10" width="16" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
      </Match>
      <Match when={props.name === "menu"}>
        <path d="M4 7h16M4 12h16M4 17h16" />
      </Match>
      <Match when={props.name === "pencil"}>
        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      </Match>
      <Match when={props.name === "plus"}>
        <path d="M12 5v14M5 12h14" />
      </Match>
      <Match when={props.name === "refresh"}>
        <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
        <path d="M16 21h5v-5" />
      </Match>
      <Match when={props.name === "report"}>
        <path d="M6 3h9l3 3v15H6z" />
        <path d="M14 3v4h4M9 12h6M9 16h6" />
      </Match>
      <Match when={props.name === "school"}>
        <path d="m3 10 9-6 9 6-9 6-9-6Z" />
        <path d="M7 13.5V18l5 3 5-3v-4.5M21 10v6" />
      </Match>
      <Match when={props.name === "search"}>
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
      </Match>
      <Match when={props.name === "students"}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </Match>
      <Match when={props.name === "trash"}>
        <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
        <line x1="10" y1="11" x2="10" y2="17" />
        <line x1="14" y1="11" x2="14" y2="17" />
      </Match>
      <Match when={props.name === "upload"}>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </Match>
      <Match when={props.name === "user"}>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </Match>
      <Match when={props.name === "x"}>
        <path d="M18 6 6 18M6 6l12 12" />
      </Match>
    </Switch>
  </svg>
);
