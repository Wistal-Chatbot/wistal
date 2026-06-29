import type { CurrentUser } from "./types";

/** Mock signed-in user for the sidebar + user menu popover. */
export const currentUser: CurrentUser = {
  name: "Jan Kowalski",
  initials: "JK",
  email: "jan.kowalski@wistal.com.pl",
  role: "Handlowiec",
  isAdmin: true,
};
