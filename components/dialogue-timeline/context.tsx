"use client";

import { createContext } from "react";
import type { SessionSubagentLink } from "@/lib/sessions/types";

/** Parent session Task children — used to link Task chips to subagent pages. */
export const TaskSubagentsContext =
  createContext<SessionSubagentLink[] | null>(null);
